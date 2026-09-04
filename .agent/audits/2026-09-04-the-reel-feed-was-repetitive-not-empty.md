# The reel feed was repetitive, not empty

2026-09-04 · branch `feat/video-library-shorts-and-slots`

Dan: *"we should have 1000's of reels to scroll through endlessly, and sadly we
don't have many."*

The feeling was right. The cause was not what it looked like.

## WHAT WAS ACTUALLY THERE

`social_reels` held **17,279 rows — carrying 1,987 distinct videos.**

```
one clip appeared 203 times, across 98 different authors
youtube / ready    9,908 rows ->   802 distinct   (12.4 copies each)
native  / ready    4,673 rows ->   479 distinct   ( 9.8 copies each)
native  / failed   1,806 rows        broken
youtube / failed     684 rows        broken
video_library        200 rows ->   200 distinct   ( 1.0 - clean)
```

So the table was not small; it was **repetitive**. Horses re-post the same
clips, and scrolling served the same material over and over. 2,490 rows were
`media_status='failed'` — broken video in the feed. Only 200 reels came from
the curated library, and those were the one source that was 1:1.

## WHY THE LIBRARY WAS SMALL

`video_library_videos` held 557 videos from 23 creators, because
`video_library_scraper.py` had two limits nobody had revisited:

1. **It only ever read each channel's `/videos` tab.** A channel's `/shorts`
   tab is a separate listing of vertical short-form video — exactly what a reel
   feed wants — and nothing here had ever read one.
2. **Caps of 6–20 per creator.**

## WHAT SHIPPED

**Shorts.** `fetch_channel_videos` now honours `creator['tab']`, and twelve
poker shorts sources were added at caps of 60–80: HCL, The Lodge, PokerGO,
WSOP, Next Gen Poker, Wolfgang, Rampage, Brad Owen, JohnnieVibes, Mariano,
Doug Polk, Negreanu. Ingestion dedupes on `youtube_video_id`, so a short
already pulled from `/videos` costs nothing.

**Slots**, a second vertical: Brian Christopher (BCSlots), The Big Jackpot,
Lady Luck HQ, NickSlots, Vegas Low Roller, Slot Queen, The Slot Cats,
CasinoDaddy — eleven sources across their `/videos` and `/shorts` tabs.

**`--verify-sources`**, and what it caught. Choosing handles means guessing,
and two guesses were wrong: `BrianChristopherSlots` and `SlotLady` resolve to
no channel at all (Brian Christopher's real handle is `BCSlots`). A wrong
handle does not fail loudly — `fetch_channel_videos` logs one warning, returns
`[]`, and the run reports success while that source contributes nothing for
ever.

So the scraper can now resolve every handle/tab and exit non-zero on any dead
one. It writes nothing and no longer needs Supabase credentials, because a
check that only runs where production secrets exist cannot gate a deploy.

**Its first run reported 43 live, 4 dead — and all four were pre-existing.**
`HELLMUTH`, `IVEY`, `DWAN` and `GARRETT` had been in the creator list since
2026-04-22 contributing zero videos, behind a comment that hedged they "may
have limited/no active channels". Removed, handles recorded in case anyone
finds the real ones. Every one of the 24 new sources was verified live before
being committed.

## THE MISTAKE THE DATABASE CAUGHT

The commit adding slot sources asserted that "nothing filters on type today, so
adding a value is safe". `video_library_videos_type_check` restricted `type` to
`('cash','tournament')`, and every slot row was refused with `23514` while the
scraper logged a warning per row and carried on — 160 videos found, downloaded
and dropped.

The constraint was right and the assumption was not. Widened to admit `'slots'`
in `20260904203000_the_video_library_admits_slots.sql`, kept as a CHECK rather
than free text so the next typo'd value is still refused loudly.

## RESULT, MEASURED

| | before | after |
|---|---|---|
| `video_library_videos` | 557 | **1,751** |
| — of which slots | 0 | **481** |
| active sources | 23 (4 of them dead) | **43, all verified live** |
| `social_reels` distinct videos | 1,987 | **2,976** |

The reels bridge added **897 new reels, every one a distinct video** — 1:1, no
duplication, which is the shape the feed needed.

## WHAT IS STILL IN FLIGHT, HONESTLY

**~1,000 of those new reels are `media_status='queued'`, not yet playable.**
They are working through `video_transcode_jobs`, which is genuinely running —
2,992 completed, ~71 in the last half hour — but at that rate the remaining
904 take roughly six hours. Distinct *playable* reels go from 1,571 to about
2,575 when it drains. Nothing is stuck; it is just slow, and it is worth
watching that the queue keeps moving.

**6,874 transcode jobs have failed**, and the pattern is a retry storm rather
than a broken pipeline: the same video IDs appear 38–54 times each, failing on
permanent YouTube conditions — `403 Forbidden`, `The page needs to be
reloaded`, and members-only videos. Those will never succeed and should stop
being retried. That is a separate fix and is not blocking anything here.

**The duplication in the existing 17,279 rows is untouched.** Deleting rows
would destroy their likes and comments, so the approach taken was to dilute it
with distinct content rather than to prune. If the feed should show each video
once regardless of who posted it, that is a query-side change and a product
decision, not a cleanup.
