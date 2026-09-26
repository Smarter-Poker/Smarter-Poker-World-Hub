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

## Discovery And Ingestion

- **ING-01:** Store sources in a database registry with stable channel identifiers and lifecycle status.
- **ING-02:** Use supported metadata interfaces and incremental cursors rather than brittle channel-page scraping.
- **ING-03:** Record last check, last success, last new item, expected cadence, and failure streak separately.
- **ING-04:** Batch metadata reads and database upserts.
- **ING-05:** Validate availability, embeddability, publication time, duration, topic, and thumbnail before publication.
- **ING-06:** Discover at least 250 qualified candidates per day without increasing duplicate publication.
- **ING-07:** Quarantine unavailable, private, age-restricted, blocked, and low-confidence assets with reason codes.

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
