# Video Library And Reels Upgrade

## Vision

Turn the Video Library, the horse content fleet, and every Reels surface into one traceable short-form discovery system. The system must make thousands of verified poker, casino-and-slots, and sports clips continuously scrollable without collapsing those categories together, while connecting each Reel to its original creator, full video, and source evidence.

## Users

- Players discovering poker, casino-and-slots, and sports short-form highlights.
- Learners saving videos, continuing playback, and moving into training.
- Creators and partners controlling attribution and permitted uses.
- Editors approving, correcting, and scheduling content.
- Operators monitoring sources, queues, feed quality, and takedowns.

## Product Principles

1. Discovery volume may grow aggressively; publication remains selective.
2. Poker, Casino And Slots, Sports, Following, and For You are explicit server-owned feed contracts. Category-specific surfaces never leak unrelated topics.
3. Third-party YouTube content uses the official embed player unless written clipping rights are recorded.
4. Every Reel is traceable from source through social publication.
5. Database constraints enforce idempotency; clients are not the final defense.
6. One canonical delivery contract serves every Reels surface.
7. User state survives stale storage, old links, removals, and interrupted requests.
8. No phase is complete until its PR is merged, migrations are applied, production is verified, and regressions are checked.
9. Horses are ordinary player-authors. Their approved video posts are eligible through the same public, rights, readiness, and moderation gates as human posts, without exposing internal fleet labels.
10. External YouTube media stays embed-only unless Smarter Poker owns or licenses a native rendition. Timestamped highlights do not authorize downloading or re-hosting the source.
11. Endless viewing means cursor-backed continuation and a bounded player window, not thousands of mounted videos or one oversized response.

## Technology And Constraints

- Next.js Pages Router, React 18, Supabase/PostgreSQL, Zustand, SWR, OpenClaw, and the Hetzner worker estate.
- Work is performed only in isolated task-owned worktrees on `/Volumes/SmarterWork/agent-work/`, per the current external-SSD storage policy.
- Database changes are forward-compatible and include executable post-apply assertions.
- YouTube metadata and playback must follow YouTube API and embedded-player policies.
- Native clipping is limited to owned or explicitly licensed media.

## Success Measures

- Zero newly published canonical duplicates.
- Zero new unapproved third-party native conversions.
- Zero newly published Reels without provenance and a linked social post.
- At least 99 percent metadata completeness before publication.
- At least 500 qualified multi-topic candidates discovered per day after ingestion expansion.
- A verified, deduplicated catalog of at least 2,000 publicly playable Reels, with a path to the existing 11,000-plus candidate reservoir.
- At least 100 quality-controlled multi-topic Reels published per day while source diversity, responsible-gambling, and feed-quality limits remain satisfied.
- Removed content disappears from active feeds, search, bookmarks, and cached responses.
- Mobile playback meets the performance budgets defined in Phase 7.
