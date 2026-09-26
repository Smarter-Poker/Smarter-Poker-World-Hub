# Video Library And Reels Upgrade

## Vision

Turn the Video Library and Reels surfaces into one traceable poker-content system. The system discovers substantially more relevant content, publishes only validated material, connects short-form discovery to full videos and training, and never loses the origin, rights, or canonical identity of an asset.

## Users

- Players discovering poker videos and short-form highlights.
- Learners saving videos, continuing playback, and moving into training.
- Creators and partners controlling attribution and permitted uses.
- Editors approving, correcting, and scheduling content.
- Operators monitoring sources, queues, feed quality, and takedowns.

## Product Principles

1. Discovery volume may grow aggressively; publication remains selective.
2. Poker-only surfaces never admit unrelated sports or slot content.
3. Third-party YouTube content uses the official embed player unless written clipping rights are recorded.
4. Every Reel is traceable from source through social publication.
5. Database constraints enforce idempotency; clients are not the final defense.
6. One canonical delivery contract serves every Reels surface.
7. User state survives stale storage, old links, removals, and interrupted requests.
8. No phase is complete until its PR is merged, migrations are applied, production is verified, and regressions are checked.

## Technology And Constraints

- Next.js Pages Router, React 18, Supabase/PostgreSQL, Zustand, SWR, OpenClaw, and the Hetzner worker estate.
- Work is performed only in isolated `.agent-trees` worktrees.
- Database changes are forward-compatible and include executable post-apply assertions.
- YouTube metadata and playback must follow YouTube API and embedded-player policies.
- Native clipping is limited to owned or explicitly licensed media.

## Success Measures

- Zero newly published canonical duplicates.
- Zero new unapproved third-party native conversions.
- Zero newly published Reels without provenance and a linked social post.
- At least 99 percent metadata completeness before publication.
- At least 250 qualified candidates discovered per day after ingestion expansion.
- Between 30 and 60 quality-controlled poker Reels published per day.
- Removed content disappears from active feeds, search, bookmarks, and cached responses.
- Mobile playback meets the performance budgets defined in Phase 7.
