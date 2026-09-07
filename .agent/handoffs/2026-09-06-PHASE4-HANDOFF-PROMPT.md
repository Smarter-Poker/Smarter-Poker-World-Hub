# HANDOFF PROMPT - Smarter.Poker Fleet Content Programme, Phase 4 -> 5
### Paste this entire file as the first message of a new chat. It assumes you know nothing.

---

# PART 0 - WHO YOU ARE AND WHAT YOU ARE PICKING UP

You are a Claude agent working on **Smarter.Poker**, Dan's poker platform. You
are running in **Cowork mode on Dan's Mac**, which means you have
`mcp__counselors__host_terminal` (real bash on his machine) and a Supabase MCP
with full production database access.

You are taking over a **10-phase programme** that makes **1,000 AI "horses"**
(never call them bots - Dan's rule) post believable social content on the
platform. **Phases 1 to 4 are shipped and live. You are starting Phase 5**, but
**Phase 4 has one unfinished item that blocks it** (Part 5).

The previous agent's session ran roughly 2026-09-05 to 2026-09-06. It shipped
14 pull requests across two repositories, applied 16 production migrations, and
was **stopped mid-session by Dan because the output was bad**. Read Part 1
before you touch anything.

**Everything in this document was verified against production or the repos on
2026-09-06 between 12:00 and 13:00 UTC.** Where something was not verified, it
says so. Do not trust any claim here without re-checking - Part 9 gives you the
exact commands, and Part 8 explains why re-checking matters more than usual on
this estate.

---

# PART 1 - THE STOP CONDITIONS. READ BEFORE ANY WORK.

## 1.1 Dan halted this work. Here is exactly what he said.

Mid-session, seeing the live feed:

> **"WHAT THE HELL ARE THESE POSTS?! THEY ARE PURE TRASH. ANYTIME YOU CREATE
> SOME NEW WAY FOR A HORSE TO POST, OR GIVE IT AN INSTRUCTION TO 'CREATE NEW
> CONTENT' I NEED TO APPROVE IT FIRST."**

> **"WTF ARE THESE 'REAL NAMES'. THEY AREN'T REAL AT ALL."**

> **"IF THIS IS YOUR WORK WITH THE BIG BLACK LABELS OR VIDEOS, ITS TRASH AND
> NEEDS TO BE FIXED."**

What was on the feed (these are real, they were live):

```
No hand, all narrative. Qh8c7d6sAd5c on 5s 4s Td 3c 6d. won 184bb
look Q7o on 3c 8h 7c 7s 4c and the whole thing went in on the river. rest is noise.
nah QTs, board came 6c 7c 9c 9h 3s, won 149bb, right.
```

That is a database row with spaces in it. Twelve characters of run-together
hole cards, a five-card board printed inline like a query result, and `184bb` -
a column name - where a person would say something they felt.

**Every one of those posts was TRUE.** They matched the hand they came from,
passed `factsMatch()`, and passed **eighteen law tests** written specifically
for them. **Not one of those tests asked whether a person would want to read
it.** The previous agent even wrote, in its own Phase 3 changelog, "the gates
prove a post is not wrong, and they cannot tell you it is not good" - and then
shipped the phase on the strength of the gates anyway.

## 1.2 THE BINDING RULE THAT CAME OUT OF IT

> **A new way for a horse to post, or any instruction to a horse to create
> content, is OFF until Dan personally approves it.**

This is enforced in three places, all of which you must leave intact:

1. **`public.horse_post_modes`** - one row per WAY a horse can post. New rows
   default to `enabled = false`.
2. **`postModeEnabled()` in `src/lib/content-engine/Fleet.ts`** - and it
   **FAILS CLOSED**. If the table cannot be read, the mode is treated as OFF.
   This is the opposite of every other fallback in this engine (everywhere else
   a failed read must not silence a horse). The reasoning, which you must not
   "optimise" away: *silence is recoverable; a thousand accounts posting
   something Dan has not seen is not.*
3. **`src/lib/content-engine/PostModes.law.test.ts`** - pins that the gate is
   the FIRST statement in `postGrounded` (before any composition or insert),
   and that the error path returns `false` not `true`.

Current table state, verified 2026-09-06 12:55 UTC:

| mode | enabled | approved_by |
| --- | --- | --- |
| poker_video | true | pre-existing |
| sports_video | true | pre-existing |
| poker_news | true | pre-existing |
| sports_news | true | pre-existing |
| **grounded_hand** | **false** | **nobody** |
| **grounded_session** | **false** | **nobody** |

The four "pre-existing" rows are marked that way **deliberately**. Nobody
approved those either; calling them "approved" would be the same lie in nicer
clothes. Do not change those labels without asking Dan.

**Approving is one UPDATE and no deploy** (the point is that the decision
belongs to Dan, not to an agent):

```sql
UPDATE horse_post_modes
SET enabled = true, approved_by = 'dan', approved_at = now()
WHERE mode = 'grounded_hand';
```

## 1.3 What you must NOT do

- **Do not enable any disabled mode.** Only Dan does that.
- **Do not add a new posting path** (a new `post*` function in
  `HorsePublisher.ts`, a new content generator, a new "horses now also post X")
  without a `horse_post_modes` row defaulting to false AND Dan's explicit
  approval in chat.
- **Do not weaken the fail-closed behaviour** in `postModeEnabled`.
- **Do not delete or "clean up"** the 59 hidden posts without asking.
- **Do not rebuild Reddit ingestion.** See Part 6.4 - it is declined on policy
  grounds, not deferred, and a future agent "fixing" it would be a mistake.

---

# PART 2 - ENVIRONMENT BOOTSTRAP. RUN THESE FIRST.

## 2.1 Confirm you are on the Mac

You must have `mcp__counselors__host_terminal`. If you do not, **stop and say
so** - everything below assumes it.

## 2.2 Node is NOT on the default PATH

Prefix EVERY command that runs node/npm/npx:

```bash
export PATH="$HOME/.nvm/versions/node/$(ls ~/.nvm/versions/node | tail -1)/bin:$PATH"
```

## 2.3 The two repositories and their worktrees

| Repo | Main clone | Your worktree (use this) |
| --- | --- | --- |
| `smarter-poker-workers` | `~/Documents/smarter-poker-workers` | `~/Documents/.agent-trees/smarter-poker-workers/cowork-fleet` |
| `Smarter-Poker-World-Hub` | `~/Documents/Smarter-Poker-World-Hub` | `~/Documents/.agent-trees/wh-fleet-phase1` |

Both worktrees were **clean with nothing unpushed** at handoff. Verify:

```bash
export PATH="$HOME/.nvm/versions/node/$(ls ~/.nvm/versions/node | tail -1)/bin:$PATH"
cd ~/Documents/.agent-trees/smarter-poker-workers/cowork-fleet && git fetch origin -q
echo "workers dirty=$(git status --porcelain|wc -l|tr -d ' ')"
cd ~/Documents/.agent-trees/wh-fleet-phase1 && git fetch origin -q
echo "wh dirty=$(git status --porcelain|wc -l|tr -d ' ')"
```

**Never edit the main clones.** They are mirrors and other agents use them. The
previous agent accidentally left an edit in the World Hub main clone and had to
`git checkout --` it back.

## 2.4 Credentials - where they live, never the value

- **`GITHUB_TOKEN`**: `~/Documents/club-arena/.env`. Read it with
  `TOK=$(grep -m1 '^GITHUB_TOKEN=' ~/Documents/club-arena/.env | cut -d= -f2-)`
- **`SUPABASE_SERVICE_ROLE_KEY`**:
  `~/Documents/Smarter-Poker-World-Hub/.env.local`
- **Supabase project**: `kuklfnapbkmacvwxktbh` (URL
  `https://kuklfnapbkmacvwxktbh.supabase.co`)
- **`gh` is NOT installed.** Use `curl` against the REST API.
- **The GitHub MCP (`mcp__github__*`) returns `Bad credentials`.** Do not
  debug it; use the host terminal.

**BINDING (Club Arena CLAUDE.md 10.84): an agent NEVER SETS a credential.**
You may read where one lives and say what SHAPE a value should have. You may
not write, rotate or paste one anywhere - not in Vercel, Supabase, GitHub
Actions or a `.env`. Those edits are Dan's.

## 2.5 THE PROCESS-GROUP TRAP - this will cost you an hour if you skip it

**`host_terminal` kills the entire process group when a call times out.** Any
job longer than the tool's patience (a `git push` takes ~3 minutes because of
the pre-push hook; scrapers take ~60s) dies mid-flight.

`nohup ... &` is **NOT** enough. `disown` is **NOT** enough. macOS has **no
`setsid` binary**. The only thing that works is a Python double-fork:

```bash
cat > /tmp/job.sh <<'EOF'
#!/bin/bash
export PATH="$HOME/.nvm/versions/node/$(ls ~/.nvm/versions/node | tail -1)/bin:$PATH"
cd ~/Documents/.agent-trees/smarter-poker-workers/cowork-fleet
git push -u origin HEAD > /tmp/job.log 2>&1
echo "EXIT=$?" >> /tmp/job.log
EOF
chmod +x /tmp/job.sh
python3 -c "
import os,subprocess
if os.fork()==0:
    os.setsid(); subprocess.call(['/bin/bash','/tmp/job.sh'],stdin=subprocess.DEVNULL); os._exit(0)
print('launched')"
# then poll in a LATER call:
grep EXIT= /tmp/job.log || echo "still running"
```

Also: **`sleep 90` inside a host_terminal call will itself time out and kill
the group.** Poll in separate short calls instead.

## 2.6 macOS sed is BSD sed

It has no `\?`, no `\|`, no `\+`. A `sed` script written for GNU will silently
do nothing and you will think your edit applied. **Use Python for all file
edits.** The previous agent lost time to exactly this.

---

# PART 3 - WHAT THE PROGRAMME IS

## 3.1 The plan document

```
~/Documents/.agent-trees/smarter-poker-workers/cowork-fleet/docs/FLEET-CONTENT-PROGRAMME.md
```

10 phases. Phases 1-4 are marked SHIPPED with their live numbers. **Read it.**

## 3.2 The phases

| Phase | What | Status |
| --- | --- | --- |
| 1 | Whole fleet eligible: `FleetScheduler`, hourly route over all 1,000 horses, DB ledgers, kill switch | SHIPPED, live |
| 2 | Comprehension and voice: `PostBrief`, 100+ style sheets, `Composer`, reply engine, friend graph | SHIPPED, live |
| 3 | Grounded content: horses post about hands they actually played | SHIPPED then **DISABLED** - this is the trash Dan saw |
| 4 | Media supply that does not repeat: `poker_clips`, channel RSS scraper, per-horse source slices | SHIPPED, live |
| 5 | **Media supply, poker** | **YOUR PHASE - do not start until Part 5 is closed** |
| 6 | Data-native and local content | not started |
| 7 | Interactive content | not started |
| 8 | Discovery and the feed | not started |
| 9 | The hand replay renderer | not started |
| 10 | One engine, measured | not started |

## 3.3 How content actually flows (so you can reason about it)

```
Open Claw cron (Hetzner VM)
  -> POST /cron/horse-posts  (hourly at :10, on the workers VM)
     -> loadFleet()                     Fleet.ts
     -> isDueForPost() per horse        FleetScheduler.ts  (10% of fleet/day)
     -> publishForHorse()               HorsePublisher.ts
        -> postGrounded()   [GATED OFF] uses GroundedComposer + HandStory
        -> postNewsLink()               reads content_sources kind='rss'
        -> postVideoClip()              reads poker_clips / sports_clips via ClipSupply
           -> writeCaption()            VoiceWriter.ts -> Composer.ts + StyleSheet.ts
           -> ledger checks             ContentLedger.ts (asset + phrase + frame)
        -> INSERT social_posts
           -> DB trigger mirrors to social_reels
```

**Cadence**: each horse posts ~10% of days, spread across all 168 hours of the
week. A recent live fire: `due 27, posted 7, skipped_recent 20, failed 0`.
`skipped_recent` is correct behaviour (the 20-hour guard), not a bug.

---

# PART 4 - COMPLETE STATE INVENTORY (verified 2026-09-06)

## 4.1 Production numbers

| Metric | Before Phase 4 | Now |
| --- | --- | --- |
| live poker clips (`poker_clips` where `is_active`) | 113 | **1,716** |
| dead clips tombstoned | 0 (36 unknowingly live) | 40 |
| poker YouTube channels active | n/a (60 literals, only 18 had clips) | 91 |
| poker channels retired as dormant | 0 | 16 |
| poker news RSS feeds | 2 hard-coded | 4 in the registry |
| sports news RSS feeds | 4 hard-coded | 4 in the registry |
| sports YouTube channels | 38 literals | 35 in the registry |
| `sports_clips` | 8,271 | 8,271 |
| reels stuck in `media_status='queued'` | 144 (for 23 days) | **0** |
| YouTube reels ready/playable | 10,961 | 11,162 |
| horses | 1,000 | 1,000 |
| horses sharing a display name | 132 | **0** |
| trash posts hidden from feed | 0 | 59 |

## 4.2 Pull requests shipped this session

**`smarter-poker-workers`** (all MERGED to main):

| PR | Commit on main | What |
| --- | --- | --- |
| #91 | `92b47f4` | Phase 3: grounded content |
| #92 | `9d18149` | Phase 3 changelog |
| #93 | `aadf88a` | Card notation keeps its case |
| #95 | `b9232c2` | Phase 3 verification: 4 defects fixed |
| #97 | `f844677` | **Phase 4**: `poker_clips` + RSS scraper, `ClipLibrary.ts` DELETED |
| #99 | `07566c7` | Dormant channels retired, newest-first ordering |
| #102 | `a2befa5` | Video-library bridge, news from registry, `tryFallbacks` fixed |
| #103 | `0fa1682` | A real title is not a noun |
| #104 | `51df3d6` | `horse_post_modes` gate + 4 law pins |
| #105 | `77e1746` | `HandVoice.ts` (the rewritten voice - NOT wired) |

**`Smarter-Poker-World-Hub`** (all MERGED):

| PR | What |
| --- | --- |
| #1427 | Hand-brief confidence repair |
| #1429 | Migration filed under the version it ran as |
| #1440 | Phase 4 migrations + Open Claw schedules |
| #1453 | Reels bridge routed to workers + `content_sources.aliases` |
| (docs) | branch `agent/cowork-fleet/docs/phase4-handoff` - the earlier, weaker handoff |

## 4.3 Migrations applied to production this session

All applied AND recorded in `supabase_migrations.schema_migrations`, all with
assertions in a `DO $$ ... RAISE EXCEPTION` block:

```
a_hand_brief_keeps_its_own_confidence
poker_gets_a_supply_that_renews
poker_clips_video_id_index_can_be_inferred
the_retired_clip_array_becomes_rows
a_reel_waiting_on_a_dead_job_falls_back_to_youtube
news_feeds_join_the_source_registry
a_channel_is_known_by_more_than_one_name
seeded_clips_answer_to_the_names_in_the_registry
twelve_more_channels_each_one_resolved_first
five_more_resolved_channels_and_the_honest_count
a_new_way_for_a_horse_to_post_is_off_until_dan_approves_it
no_two_horses_share_a_name
```

Verify any of them:

```sql
select version, name from supabase_migrations.schema_migrations
where name like '%poker%' or name like '%horse%' order by version desc limit 20;
```

## 4.4 New database objects

| Object | Purpose |
| --- | --- |
| `content_sources` | ONE registry for every channel/feed. Columns: `domain` (poker/sports), `kind` (youtube_channel/rss), `name`, `handle`, `channel_id`, `feed_url`, `fallback_urls`, `aliases[]`, `is_active`, `last_scraped_at`, `consecutive_failures`, `clips_found` |
| `poker_clips` | Poker video supply, the twin of `sports_clips`. Key columns: `video_id` (unique), `source`, `source_id`, `published_at`, `oembed_ok`, `oembed_checked_at`, `is_active`, `origin` (library/scraper/video_library) |
| `horse_post_modes` | The approval gate. See Part 1.2 |
| `fn_reel_falls_back_when_job_dies()` + trigger on `video_transcode_jobs` | When a yt-dlp download job fails, the reel stops waiting and falls back to playing from YouTube |

## 4.5 New cron routes (workers repo, scheduled via Open Claw)

| Route | Schedule | What |
| --- | --- | --- |
| `/cron/scrape-poker-clips` | 05:20 and 17:20 UTC | Walks 25 channels/run by RSS, least-recently-scraped first. Also imports from `video_library_videos` |
| `/cron/revalidate-poker-clips` | every hour at :40 | 40 clips/run against YouTube oEmbed; writes `oembed_ok` |
| `/cron/content-supply-watchdog` | every hour at :50 | Reports (never repairs) 4 supply health questions |
| `/cron/video-library-reels` | daily 07:00 UTC | Caption sync AND the library->reels bridge (40/run, spread across the fleet) |

Registered in `~/Documents/.agent-trees/wh-fleet-phase1/scripts/openclaw-cron-dispatcher.py`
in THREE places each: the schedule list, `WORKERS_PREFERRED` routing map, and
the timeout map. **The World Hub `deploy-openclaw.yml` workflow auto-deploys
that file to the Hetzner VM on merge to main** - it fired successfully at
12:10 UTC.

---

# PART 5 - YOUR FIRST TASK (BLOCKS PHASE 5)

## 5.1 The situation

Dan was asked what to do about the grounded hand posts and chose:
**"Rewrite the voice, show me before it runs."**

- **DONE**: `src/lib/content-engine/HandVoice.ts` exists on `main` (PR #105).
- **DONE**: sampled twice against REAL hands from production.
- **NOT DONE**: it is **NOT wired to the publisher**. `postGrounded()` still
  calls the old `GroundedComposer`, and is gated off anyway.
- **NOT DONE**: **Dan has not seen the samples.**

## 5.2 What HandVoice does

Three rules, all about the reader:

1. **Never print notation.** `sayHolding()` turns `"KK"` into `"kings"`,
   `"AKs"` into `"ace-king suited"`. A four-card PLO holding returns `null` -
   reciting four cards is what a chip counter does.
2. **Never print the board.** `sayBoard()` reads the TEXTURE from the five
   cards and returns `"a paired board"`, `"a board the flush got there on"`,
   `"a wet paired board"`, `"a dry board"`.
3. **Never print big blinds.** `sayMoney()` turns `netBb: -260` into
   `"about as bad as it gets"`, `+45` into `"a good pot"`.

A post is allowed to say LESS than the row knows. You cannot reconstruct the
hand from the post - **that is correct**, because neither can you from a person
telling you about one.

## 5.3 The samples to show Dan (regenerate them first - they come from live data)

```bash
export PATH="$HOME/.nvm/versions/node/$(ls ~/.nvm/versions/node | tail -1)/bin:$PATH"
cd ~/Documents/.agent-trees/smarter-poker-workers/cowork-fleet
cat > voice-samples.ts <<'TS'
import { pickHandStory } from './src/lib/content-engine/HandStory.js';
import { lineFor } from './src/lib/content-engine/HandVoice.js';
import { getSupabase } from './src/lib/supabase.js';
const { data } = await getSupabase().from('profiles').select('id, full_name').eq('is_horse', true).limit(120);
const used = new Set<string>(); let n = 0;
for (const h of (data ?? []) as Array<{id:string; full_name:string}>) {
  if (n >= 20) break;
  const hand = await pickHandStory(h.id); if (!hand) continue;
  const line = lineFor(hand, `${h.id}:${hand.handId}`, used); if (!line) continue;
  used.add(line.key); n++;
  console.log(`${String(n).padStart(2)}. ${h.full_name.padEnd(22)} ${line.text}`);
}
console.log(`\n${n} samples, ${used.size} distinct shapes.`);
TS
# run it with the service key (see Part 2.4 for where the key lives), then:
rm -f voice-samples.ts
```

The samples the previous agent got (2026-09-06 12:35 UTC):

```
 1. finally won one. aces, all the way
 2. had kings and lost it on the river. that is poker apparently
 3. kings into a wet paired board. no way to fold, no way to win
 4. nothing clever, just jacks and someone who did not believe me
 5. no way to play king-jack suited for less than everything
 6. told the story all the way to the end on a paired board. they believed it
 7. fired the last one with nothing and got the fold. most of a stack
 8. that was the biggest pot of my night, and I did not have to do anything smart
 9. do that a hundred times and I win most of them. not tonight
10. all of it in on a connected board and I was not folding either
```

## 5.4 Exactly what to do

1. **Regenerate the samples** (above). Do not show Dan the old ones - the pool
   is live data and will have moved.
2. **Show Dan the samples and ask directly**: is this the voice, or is it still
   wrong? Give him the old trash lines alongside for contrast.
3. **If he says NO**: ask what is wrong specifically, rewrite `LINES` and the
   `say*` helpers in `HandVoice.ts`, re-sample, ask again. Do not wire
   anything.
4. **If he says YES**:
   - Wire `lineFor()` into `postGrounded()` in `HorsePublisher.ts`, replacing
     the `composeHandPost()` call. Keep the frame-ledger dedupe
     (`recentFrameKeys` / `frameKey` in `ContentLedger.ts`) - `lineFor` already
     returns a `key` in the same `frame:voice:<category>:<n>` shape.
   - Keep `factsMatch()` if it still applies, or replace it with a check that
     the SPOKEN form cannot contradict the row.
   - Add law pins in `PostModes.law.test.ts` style.
   - Run the full gate (Part 9.3).
   - Push on a NEW branch off current `main` (Part 8.1).
   - **Only after it is merged and deployed**, ask Dan to run the UPDATE in
     Part 1.2. **You do not run it.**

## 5.5 `grounded_session` has no rewrite at all

`HandVoice.ts` covers HANDS only. `composeSessionPost()` in
`GroundedComposer.ts` still produces the old style for session posts, and
`grounded_session` is disabled alongside `grounded_hand`. If Dan approves the
hand voice, ask whether he wants sessions rewritten the same way or dropped.

---

# PART 6 - THE FULL BACKLOG

## 6.1 HIGH - Dan raised these and they are not fully answered

**(a) The grounded voice.** Part 5. Blocks Phase 5.

**(b) Horse names - PARTIALLY done, he may still be unhappy.**
Dan said the names "aren't real at all". Measured: all 1,000 horses display
`profiles.full_name`, and **132 shared a name with another horse** ("Isolde
Beauchamp" three times, "Andrew Colombo" three times). Cause: horses were
copied and the suffix went on the USERNAME (`andrew colombo 2`) while the
display name stayed identical.

**Fixed**: 132 -> 0. New names were recombined from the fleet's OWN first and
last names (486 firsts x 449 lasts = 196,340 pairings that did not already
exist), so nothing new was invented. Rehearsed in a rolled-back transaction
first.

**Dan was asked** whether to switch the feed to the poker aliases (every horse
has a unique one in `profiles.alias` - TheViking, Big Blind, SDLegend, venom)
and **he chose to keep full names and just fix the duplicates**. Recorded so
nobody "fixes" it back.

**STILL POSSIBLY WRONG**: he may dislike the naming STYLE itself. Some read
oddly: "Stackoff SUE", "Potodds Paul", "Allin Sinclair", "Philippa
Provenzano". **Ask before any mass rename.**

**(c) 123 horse usernames still contain SPACES** (e.g. `isolde beauchamp`).
Only the copy-suffixed ones were rebuilt. Check whether usernames are
player-visible (profile URLs) before deciding. Not raised by Dan directly.

**(d) The "big black labels" on videos.** Dan called them trash.
**They are NOT ours.** Verified: 1,251 of 1,373 recent reel thumbnails are
`i.ytimg.com` - the creator's own YouTube artwork ("$2,478,000 POKER HAND!",
"INSANE COOLER FOR $1,200,000!"). Nothing in our code draws them.
**Dan was told this and offered the alternative: extract a clean frame from the
video instead of using the channel thumbnail. He has not answered.** Follow up.

## 6.2 MEDIUM

**(e) 59 hidden posts.** Set `is_deleted = true` on 2026-09-06 (reversible, not
a hard delete - the rows stay readable for whoever rebuilds the voice). Decide
with Dan: leave hidden, or hard-delete once the new voice ships.

**(f) `grounded_session`** - Part 5.5.

**(g) Twitch clips - BLOCKED ON A CREDENTIAL.** The Twitch API needs a
registered application's `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`.
Neither exists anywhere in this estate (checked). Creating an app is an account
action = Dan's, not an agent's (CLAUDE.md 10.84). No code written. Ready to
build the moment he provides them.

## 6.3 The contract items that are DONE differently than written

**(h) "200 poker channels" - the registry holds 91 active.** Two batches of
hand-written candidate handles were resolved against YouTube before seeding:
**12 of 18** in the first batch, **5 of 18** in the second. The hit rate falls
because the obvious channels are already in. Continuing would mostly add rows
that fail every hour.

What the contract actually wanted - a supply that does not repeat - **is met
and measured**: 1,716 live clips against roughly 245 poker video posts a week,
from a phase that started at 113. Adding more is now a ROW, not a deploy:
insert a name + handle and the scraper resolves it, or counts failures and
deactivates it.

## 6.4 DECLINED - do not build this

**(i) Reddit r/poker.** `https://www.reddit.com/robots.txt` is:

```
User-agent: *
Disallow: /
```

and their Public Content Policy restricts automated use of public content. The
`.rss` feed answers HTTP 200, so it IS buildable - **it should not be built.**
Republishing another site's community content on a commercial platform against
its stated terms is not a technical problem to route around. **If a future
agent "fixes" this by building it, that is a mistake.**

## 6.5 LOW / WATCH

**(j) ZERO tournament wins.** 0 first places across 123,237 finishes in seven
days. Flagged to Dan twice, still unexplained, unrelated to content. Someone
should look at tournament settlement.

**(k) Dan's Mac disk was 100% FULL** - 130MB free of 926GB, which was breaking
git and builds. ~11GB of regenerable caches cleared (Homebrew, TypeScript,
npm). Still large in `~/Library/Caches`: Chrome 2.6GB, playwright-mcp 1.4GB,
Codex 1.7GB, camoufox 656MB. **Re-check before any big build.**

**(l) 1,601 native + 684 youtube reels at `media_status='failed'`.** Older than
the 144 that were fixed. Not investigated.

---

# PART 7 - EVERY DEFECT FOUND THIS SESSION AND ITS LESSON

**Read this part.** Every one of these was found by READING OUTPUT or RUNNING
CODE, never by a test. They repeat if you do not know them.

## 7.1 Phase 3 verification (four defects, all shipped "green")

1. **58 grounded posts drawn from 14 sentence skeletons in 8 hours.** The
   phrase ledger keys on rendered TEXT, and the cards make every grounded post
   unique - *the numbers that make a hand post true are the same numbers that
   hid the repetition*. Fix: ledger the SKELETON too, under
   `frame:hand:<category>:<n>`, 3-hour window.
2. **"the whole thing went in on the river" offered to a hand that ended on the
   flop.** The numbers-are-the-ledger rule covers STREETS. Frames now declare
   the furthest street they name.
3. **Every hand brief judged "uninformative" and clamped 1.00 -> 0.35, and the
   clamp written BACK.** `isUninformativeTitle` counts words longer than two
   letters; a hand title is `AA on Qc 8s Qs 9c 9d` - every token is one or two
   characters. 33 of 67 damaged in a day. A read-time sanitisation that gets
   persisted is a cache that degrades every time it is used.
4. **Comments substituted the category ENUM into English**: "how often is the
   big win actually the right call there". A label is a column value, not
   something a person says.

## 7.2 Phase 4 (five more)

5. **A stale copy of the dispatcher pasted over the worktree** would have
   unregistered `/api/cron/horse-posts`, `/api/cron/horses-social-all` and
   `/api/cron/table-socket-probe` - **the entire Phase 1 delivery, plus the
   cron whose absence made tables say "Reconnecting" for 22 hours.** Caught by
   Build Safety Gate CHECK 8. **PASTING A WHOLE FILE OVER ANOTHER TREE IS NOT
   AN EDIT.** Anchor on the text you mean to change; diff against
   `origin/main` before committing.
6. **A YouTube throttle read as a graveyard.** See Part 8.2.
7. **`@JonathanLittle` is a real channel whose page has no `channelId` key at
   all.** The resolver now tries `og:url` FIRST.
8. **The library's slots channels drowned poker in any newest-N window.** The
   filter moved into the query - and the names passed to `.in()` must be the
   ones AS STORED, because `.in()` is exact-match and lower-cased lookup keys
   match nothing, silently.
9. **A real title is not a noun.** `{topic} is a spot worth sitting with` given
   a sentence produced *"Daniel Negreanu is literally trying to give his money
   is a spot worth sitting with."* And a nine-word trim turned "give his money
   **away**" into "give his money" - **a different claim, stated as fact**.

## 7.3 The shape they all share

**A component built for one kind of input, quietly wrong when a truer input
arrived.** The category label used as English. The title fragment used as a
person. A sentence used as a noun. The slots channel in a poker feed. The
throttle read as a graveyard. **Better data does not make old assumptions
safer - it exposes them.**

And the one Dan taught: **a test I write cannot tell me whether the writing is
any good, because I am the one who thought it was good enough to ship. Only a
person reading it can.**

---

# PART 8 - TRAPS. ALL THREE COST REAL TIME.

## 8.1 MERGED IS NOT LANDED (Club Arena CLAUDE.md 10.82, BINDING)

`agent-autopilot.yml` squash-merges the moment required checks pass - under two
minutes on a small change. **Push again after that and the branch moves, the PR
stays merged, `git push` exits 0, and your commits reach nobody.** World Hub
#1387 shipped 1 of its 3 commits this way.

- **A follow-up commit needs a NEW BRANCH off current `main`.**
- **Verify the FILES, never the tick:**
  ```bash
  git fetch origin main
  git cat-file -e origin/main:src/lib/content-engine/HandVoice.ts && echo OK
  ```

## 8.2 INSTRUMENTS THAT LIE

**(a) YouTube throttles with a ~755-byte page at HTTP 200.** Not a 404 - a
200. Probing ~60 channel pages quickly made **every** handle read as dead,
including `@LiveattheBike` and `@PhilHellmuth` which had resolved minutes
earlier. Six such "failures" in a row retires a channel
(`DEACTIVATE_AFTER: 6`). `resolveChannelId()` now returns
`{ channelId, throttled }` and a throttled run never increments the failure
count. **Never read a non-answer as a negative answer.**

**(b) The GitHub API rate limit returns `None` for everything.** 5,000/hr, and
this session exhausted it. It looks exactly like "the workflow does not exist".
Check first:
```bash
TOK=$(grep -m1 '^GITHUB_TOKEN=' ~/Documents/club-arena/.env | cut -d= -f2-)
curl -s -H "Authorization: Bearer $TOK" https://api.github.com/rate_limit \
 | python3 -c "import json,sys,time;d=json.load(sys.stdin)['resources']['core'];print(d['remaining'],'/',d['limit'],'resets in',int((d['reset']-time.time())/60),'min')"
```

**(c) A shell regex probe is weaker than the real code.** A `curl | grep`
check said 27 of 30 handles did not exist. Re-run with the ACTUAL
`resolveChannelId()` at 4-second spacing: **12 of 18 resolved.** **Test with
the code that will do the work.**

## 8.3 A TRANSACTION DOES NOT SPAN TWO SUPABASE MCP CALLS (CLAUDE.md 11.5)

`BEGIN;` in one call, probe in the next, `ROLLBACK;` in a third **commits the
probe**. Use ONE call, ONE `DO $$ ... $$` block that ends by
`RAISE EXCEPTION`. **An ERROR is the success case.** If such a probe returns
success, it COMMITTED - go and undo what it wrote.

Worked example (this is how the name fix and the reels repair were proven):

```sql
DO $$
DECLARE v_before int; v_after int;
BEGIN
  SELECT count(*) INTO v_before FROM ...;
  UPDATE ...;
  SELECT count(*) INTO v_after FROM ...;
  RAISE EXCEPTION 'REHEARSAL (rolled back): before=% after=%', v_before, v_after;
END $$;
```

## 8.4 Other binding rules you will trip over

- **Never hand-pick a migration version.** Use
  `node scripts/new-migration.mjs "what it does"` (Club Arena) or let
  `apply_migration` assign one. Two files sharing a version means **the second
  is SILENTLY NEVER APPLIED**.
- **Name the migration FILE for the version it actually ran as.** The previous
  agent applied one at `20260906092121` and filed it as `20260906103000`; it
  needed a follow-up PR to correct.
- **Never schedule anything on the Claude scheduler** (CLAUDE.md 10.85). It
  binds to one account, reports `enabled: true`, and never fires. Use Open Claw.
- **Never set a timer to watch CI** (10.8.3). Push, report, stop.
- **Horses are players** (10.5). Never write `is_horse` to EXCLUDE a horse from
  something a human gets.
- **No em dashes** anywhere in player-visible text. No emoji in source files.

---

# PART 9 - VERIFICATION COMMANDS

## 9.1 FIRST JOB: verify the other agent's production fixes

**Dan said another agent is currently fixing production issues from the last
push. Verify their work landed before you build on it. Do not assume.**

```bash
export PATH="$HOME/.nvm/versions/node/$(ls ~/.nvm/versions/node | tail -1)/bin:$PATH"
cd ~/Documents/.agent-trees/smarter-poker-workers/cowork-fleet && git fetch origin -q
git log --oneline origin/main -20

# Phase 4 files must all be present on main:
for f in src/lib/content-engine/ClipSupply.ts \
         src/lib/content-engine/HandVoice.ts \
         src/lib/content-engine/PostModes.law.test.ts \
         src/lib/content-engine/Supply.law.test.ts \
         src/routes/scrape-poker-clips.ts \
         src/routes/revalidate-poker-clips.ts \
         src/routes/content-supply-watchdog.ts; do
  git cat-file -e origin/main:$f 2>/dev/null && echo "OK      $f" || echo "MISSING $f"
done

# ClipLibrary.ts must be GONE (it was deleted in #97):
git cat-file -e origin/main:src/lib/content-engine/ClipLibrary.ts 2>/dev/null \
  && echo "PROBLEM: ClipLibrary.ts is back" || echo "OK: ClipLibrary retired"

# The gate must be intact:
git show origin/main:src/lib/content-engine/HorsePublisher.ts | grep -c "postModeEnabled('grounded_hand')"
git show origin/main:src/lib/content-engine/Fleet.ts | grep -A3 "if (error)" | grep -c "return false"
```

Then the deploy (merge is not deploy):

```bash
TOK=$(grep -m1 '^GITHUB_TOKEN=' ~/Documents/club-arena/.env | cut -d= -f2-)
curl -s -H "Authorization: Bearer $TOK" \
  "https://api.github.com/repos/Smarter-Poker/smarter-poker-workers/actions/workflows/auto-deploy-workers.yml/runs?per_page=5" \
  | python3 -c "import json,sys;[print(r['head_sha'][:7],r['status'],r['conclusion'],r['created_at']) for r in json.load(sys.stdin)['workflow_runs']]"
```

## 9.2 Production health

```sql
select 'poker_clips live' k, count(*)::text v from poker_clips where is_active
union all select 'poker channels active', count(*)::text from content_sources
  where domain='poker' and kind='youtube_channel' and is_active
union all select 'reels stuck queued', count(*)::text from social_reels where media_status='queued'
union all select 'horses sharing a name', count(*)::text from profiles p where is_horse
  and exists (select 1 from profiles q where q.is_horse and q.full_name=p.full_name and q.id<>p.id);

-- the gate must still be closed:
select mode, enabled, approved_by from horse_post_modes order by enabled desc, mode;

-- did the new crons fire?
select job_name, status, started_at::time(0) at, left(coalesce(result::text,error,''),110) detail
from cron_execution_log
where started_at > now() - interval '6 hours'
  and (job_name ilike '%poker-clips%' or job_name ilike '%supply-watchdog%'
       or job_name ilike '%video-library%' or job_name ilike '%horse-posts%')
order by started_at desc limit 20;
```

**What a healthy `/cron/horse-posts` result looks like** (12:10 UTC fire):

```json
{"due":27,"posted":7,"failed":0,"skipped_recent":20,
 "by_type":{"poker_video":2,"grounded_hand":5},
 "supply":{"poker_fresh_candidates_50plus":2,"rss_ok":2},
 "avg_relevance":0.95}
```

**NOTE**: that fire shows `grounded_hand: 5` because it ran BEFORE the gate
deployed. After the gate, `by_type` should show **no `grounded_hand` at all**
and `attempts` should include `grounded: grounded posts await approval`.
**If you still see `grounded_hand` in a fire after 13:00 UTC 2026-09-06, the
gate is not live - investigate immediately.**

## 9.3 The full build gate (run before every push)

```bash
export PATH="$HOME/.nvm/versions/node/$(ls ~/.nvm/versions/node | tail -1)/bin:$PATH"
cd ~/Documents/.agent-trees/smarter-poker-workers/cowork-fleet
npx tsc --noEmit                    # must be silent
npx eslint src --ext .ts            # must be "0 errors" (90 warnings is normal)
npx vitest run                      # 257 tests, 42 files, all must pass
npm run build                       # must produce dist/index.mjs
```

World Hub, if you touch the dispatcher:

```bash
cd ~/Documents/.agent-trees/wh-fleet-phase1
python3 -c "import ast; ast.parse(open('scripts/openclaw-cron-dispatcher.py').read()); print('parses OK')"
node --test __tests__/openclaw-workers-secret.test.mjs __tests__/openclaw-critical-jobs.test.mjs
# and ALWAYS:
git show origin/main:scripts/openclaw-cron-dispatcher.py > /tmp/m.py
diff /tmp/m.py scripts/openclaw-cron-dispatcher.py | grep -c '^<'   # MUST be 0 lines lost
```

---

# PART 10 - FILE MAP OF THIS PROGRAMME

All paths relative to
`~/Documents/.agent-trees/smarter-poker-workers/cowork-fleet/`

| File | What it does |
| --- | --- |
| `src/lib/content-engine/Fleet.ts` | `loadFleet()`, `engineEnabled()` kill switch, **`postModeEnabled()` approval gate (fails closed)** |
| `src/lib/content-engine/FleetScheduler.ts` | `fleetHash()` (used everywhere for determinism), `isDueForPost()`, `isOnlineNow()` |
| `src/lib/content-engine/HorsePublisher.ts` | THE publisher. `publishForHorse()`, `postGrounded()` (gated), `postNewsLink()`, `postVideoClip()`, `youtubeValidity()` |
| `src/lib/content-engine/ClipSupply.ts` | **Phase 4 core.** `candidateClips()`, `sliceForHorse()`, `sportsShareFor()`, `newsSources()`, `pokerChannelIndex()` |
| `src/lib/content-engine/HandVoice.ts` | **The rewrite. NOT WIRED.** `sayHolding()`, `sayBoard()`, `sayMoney()`, `lineFor()` |
| `src/lib/content-engine/GroundedComposer.ts` | The OLD hand composer that produced the trash. Still wired, gated off |
| `src/lib/content-engine/HandStory.ts` | `pickHandStory()`, `pickSessionStory()`, `HandFacts` |
| `src/lib/content-engine/PostBrief.ts` | Reads a post/asset into a brief. `topicOf()`, `isUninformativeTitle()` |
| `src/lib/content-engine/Composer.ts` | Brief + style -> text. `composeCaption()`, `composeComment()`, `agentOf()`, `anchorOf()`, `titleIsAClause()` |
| `src/lib/content-engine/StyleSheet.ts` | 100+ deterministic voices from a dimension grid |
| `src/lib/content-engine/ContentLedger.ts` | Asset (30d), phrase (90d/48h), **frame (3h)** ledgers |
| `src/lib/content-engine/VoiceWriter.ts` | Draft loop with relevance floor + ledger checks |
| `src/routes/scrape-poker-clips.ts` | Channel RSS scraper + `importFromVideoLibrary()` + `resolveChannelId()` |
| `src/routes/revalidate-poker-clips.ts` | oEmbed sweep, never reads 429/403 as dead |
| `src/routes/content-supply-watchdog.ts` | 4 supply questions, reports only |
| `src/routes/video-library-reels.ts` | Caption sync + `bridgeLibraryToReels()` |
| `*.law.test.ts` | `Voice`, `Grounded`, `Supply`, `PostModes` - 257 tests total |

**Changelogs** in `docs/changelog/` - read these for the reasoning:
`2026-09-06-a-new-way-to-post-needs-approval.md` **(read this one first)**,
`2026-09-06-poker-gets-a-supply-that-renews.md`,
`2026-09-06-the-supply-uses-what-we-already-have.md`,
`2026-09-06-a-dormant-channel-is-not-a-source.md`,
`2026-09-06-a-real-title-is-not-a-noun.md`,
`2026-09-06-grounded-posts-read-like-poker.md`

---

# PART 11 - HOW TO BEHAVE ON THIS PROGRAMME

1. **Read the live output before you believe anything.** Every defect in Part 7
   passed its tests. Pull actual posts from `social_posts` and read them as a
   player would.
2. **When you find a defect, fix it fully** (CLAUDE.md section 4, fix-first).
   Do not collect a list and ask what to do.
3. **Write it down in your OWN file**: `docs/changelog/YYYY-MM-DD-<slug>.md`.
   Never append to a shared file - that was the single biggest source of merge
   conflicts in this estate.
4. **Say what you actually measured**, with the number and when. "Probably" is
   not evidence.
5. **When an instrument disagrees with something you are confident about,
   suspect the instrument** (Part 8.2). All three lies this session produced a
   confident wrong conclusion first.
6. **Do not pad a number to meet a contract.** 91 verified channels beats 200
   with 109 dead rows, and the previous agent said so to Dan explicitly.
7. **Ask Dan before anything player-visible changes shape** - a new posting
   path, a mass rename, a feed change. That is now a rule, not a courtesy.

---

# PART 12 - YOUR OPENING MOVES, IN ORDER

1. Run Part 2.3 (worktrees clean?) and Part 9.1 (other agent's fixes landed?).
2. Run Part 9.2 (production health + gate still closed?).
3. Read `docs/changelog/2026-09-06-a-new-way-to-post-needs-approval.md`.
4. Read `docs/FLEET-CONTENT-PROGRAMME.md` Phase 5.
5. Regenerate the HandVoice samples (Part 5.3) and **put them to Dan** with
   the old trash lines for contrast.
6. **Wait for his answer.** Do not start Phase 5 until Part 5 is closed.
7. While waiting, you may safely: chase 6.1(d) (the thumbnail offer), 6.1(c)
   (spacey usernames), 6.5(l) (the failed reels), or 6.5(j) (zero tournament
   wins) - none of those creates a new way for a horse to post.

**Do not enable `grounded_hand`. Only Dan does that.**
