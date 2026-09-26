# Requirements

## Integrity And Lineage

- **INT-01:** Store origin, playback mode, topic, rights status, source asset, and canonical asset key independently.
- **INT-02:** Preserve a stable relationship among a library asset, Reel, and social post.
- **INT-03:** Make publication replay-safe and concurrency-safe in PostgreSQL.
- **INT-04:** Prevent newly published duplicate canonical library Reels.
- **INT-05:** Retain attribution, engagement, and redirect information when historical duplicates are consolidated.
- **INT-06:** Provide independent kill switches for discovery, enrichment, Reel creation, and publication.

## Rights And Trust

- **RGT-01:** Default third-party YouTube assets to embed-only playback.
- **RGT-02:** Queue native clipping or transcoding only for owned or explicitly licensed assets.
- **RGT-03:** Record rights evidence, permitted uses, territory, dates, and revocation status.
- **RGT-04:** Propagate takedowns through feeds, search, saves, deep links, and caches.
- **RGT-05:** Show accurate creator attribution and never use an unrelated fallback identity.
- **RGT-06:** Label sponsored, promotional, generated, and community-submitted media.
- **RGT-07:** Preserve YouTube player branding and controls, send an identifying referrer, query and honor Made For Kids status, keep only one visible autoplaying embed, and never download or cache third-party audiovisual content.

## Discovery And Ingestion

- **ING-01:** Store sources in a database registry with stable channel identifiers and lifecycle status.
- **ING-02:** Use supported metadata interfaces and incremental cursors rather than brittle channel-page scraping.
- **ING-03:** Record last check, last success, last new item, expected cadence, and failure streak separately.
- **ING-04:** Batch metadata reads and database upserts.
- **ING-05:** Validate availability, embeddability, publication time, duration, topic, and thumbnail before publication.
- **ING-06:** Discover at least 250 qualified candidates per day without increasing duplicate publication.
- **ING-07:** Quarantine unavailable, private, age-restricted, blocked, and low-confidence assets with reason codes.
- **ING-08:** Use each channel's stable uploads playlist for incremental creator ingestion and `videos.list(chart=mostPopular, videoCategoryId=17)` for regional sports discovery; persist provider cursors, region, category, and retrieval time rather than scraping a Trending page.

## Enrichment And Editorial

- **ENR-01:** Classify game type, format, skill level, concepts, players, events, stakes, language, and source quality.
- **ENR-02:** Run tagging, transcript, chapter, and analysis work through durable jobs with retries and dead letters.
- **ENR-03:** Support discovered, validated, enriched, candidate, approved, rejected, and published states.
- **ENR-04:** Give editors control over clip boundaries, crop, captions, title, thumbnail, attribution, and schedule.
- **ENR-05:** Detect ads, blank frames, duplicate captions, poor audio, mid-sentence cuts, and weak relevance.

## Reel Creation

- **REL-01:** Publish validated Shorts as canonical Reel candidates.
- **REL-02:** Represent third-party highlights with embedded start and end timestamps.
- **REL-03:** Generate native vertical clips only from rights-cleared source masters.
- **REL-04:** Support subtitles, safe-area framing, action-aware crops, poster generation, and branding for owned media.
- **REL-05:** Limit publication frequency per source, source video, creator, and topic.
- **REL-06:** Store the selection reason and quality score for every generated segment.

## Delivery And Experience

- **UX-01:** Serve one canonical cursor-paginated Reels API to every client surface.
- **UX-02:** Use one shared player and Reel card implementation.
- **UX-03:** Offer Following, For You, Latest, Learning, and Shorts feeds.
- **UX-04:** Provide Continue Watching, New Today, Shorts, skill-level, creator, event, and duration library views.
- **UX-05:** Connect every Reel to its full video, timestamp, study list, related lessons, and training actions.
- **UX-06:** Support captions, reduced motion, screen readers, keyboards, data saver, and low-memory devices.
- **UX-07:** Restore feed and playback state after refresh, old links, stale storage, and navigation.
- **UX-08:** Provide Not Interested, Already Watched, Wrong Category, and Hide Source controls.
- **UX-09:** Provide For You, Poker, Casino And Slots, Sports, and Following categories from one validated server contract.
- **UX-10:** Continue for at least three cursor pages without leaving the Social Media viewer, while retaining the active Reel during appends, refreshes, failures, and retries.
- **UX-11:** Keep the live media window bounded to previous, current, and next, with no more than one active YouTube iframe and one active native player.
- **UX-12:** Display source/channel attribution, responsible-gambling context for casino content, and a source fallback for every third-party embed.

## Fleet And Supply Publication

- **SUP-01:** Treat an approved horse-authored video post as an ordinary player-authored candidate and never exclude it because its author is a horse.
- **SUP-02:** Separate the Reels/video publication gate from the global horse text-content engine switch so disabling generated posts does not silently disable approved video supply.
- **SUP-03:** Mirror every eligible video post atomically into one canonical social Reel with explicit topic, rights, playback, source, and author lineage.
- **SUP-04:** Verify YouTube availability and embeddability before public eligibility and record the verdict in the shared authoritative verifier contract.
- **SUP-05:** Backfill eligible poker-clips, sports-clips, and Video Library inventory through idempotent bounded publication, never direct ad hoc inserts.
- **SUP-06:** Deduplicate globally by canonical asset while enforcing per-source, per-topic, and per-author diversity.
- **SUP-07:** Preserve the existing user-upload path and its engagement while adding managed supply.

## Search And Personalization

- **SRCH-01:** Search titles, creators, concepts, chapters, and approved transcript text semantically.
- **SRCH-02:** Rank using freshness, relevance, completion, saves, learning goals, diversity, and explicit feedback.
- **SRCH-03:** Maintain per-session seen state and enforce creator, topic, and format diversity.
- **SRCH-04:** Explain recommendations and retain a chronological alternative.
- **SRCH-05:** Prevent automated accounts from influencing organic ranking analytics.

## Creator And Operations

- **OPS-01:** Let creators claim sources, submit masters, manage attribution, grant rights, review clips, and request takedowns.
- **OPS-02:** Give operators source, queue, duplicate, rights, candidate, schedule, ranking, and takedown controls.
- **OPS-03:** Track discovery-to-view trace IDs and the complete content funnel.
- **OPS-04:** Alert on freshness, duplicate, topic leakage, playback, rights, and publication thresholds.
- **OPS-05:** Support canary rollout, feature flags, circuit breakers, rollback, and replayable jobs.
- **OPS-06:** Measure mobile startup, dropped frames, memory, battery, and data usage.
- **OPS-07:** Report candidate, verified, published, rejected, stale, and feed-visible counts separately by topic and source family so a green-but-empty publisher cannot pass.
- **OPS-08:** Budget and report YouTube API quota by ingestion method, prefer one-unit playlist/video reads over high-cost search, and stop before quota exhaustion without publishing unverified fallbacks.
