# Phase 2 Plan: Historical Reconciliation And Legacy Retirement

## Confirmed Baseline

Phase 1 publishes and reads a rights-gated, terminal canonical feed, but historical identity is still computed at read time. There is no durable alias-to-winner registry, retired loser IDs can return 404/410 instead of resolving to a safe winner, and legacy write paths can strand engagement on a loser. Several profile and saved-post surfaces still read video rows outside the canonical server boundary. Confirmed obsolete direct writers, debug endpoints, and a duplicate static catalog also remain in the production tree.

## Wave 1: Durable Historical Identity

1. Add an immutable Reel alias registry and reconciliation operation ledger.
2. Reject self-links, cycles, mixed canonical assets, ambiguous attribution, unresolved rights, active jobs, and unsupported interaction collisions.
3. Resolve old Reel and source-post identifiers to one durable winner before applying the current availability, rights, audience, topic, and storage gates.
4. Preserve every loser UUID as a non-public tombstone; never delete historical rows.

## Wave 2: Engagement-Preserving Reconciliation

1. Move or collapse likes, comments, saves, shares, reports, and interaction rows under an explicit deterministic collision policy.
2. Preserve source-post engagement separately from Reel engagement.
3. Sum views exactly once and recompute displayed counters from authoritative rows.
4. Route writes through the canonical resolver so old clients cannot create new loser engagement.
5. Record before/after totals and fail the transaction when any invariant differs.

## Wave 3: Quarantine And Takedown Propagation

1. Replace raw profile and saved-video reads with the canonical server boundary.
2. Propagate post privacy, deletion, rights revocation, and confirmed media failures to linked Reels and every mounted viewer.
3. Make invalidation work for signed-out viewers and every allowlisted category.
4. Revalidate on focus/navigation and preserve a safe adjacent player when the active item is removed.
5. Require deliberate verified republish before a quarantined asset can return.

## Wave 4: Legacy Retirement

1. Remove confirmed uncalled direct writers and fake seed/test pipelines.
2. Remove production debug routes that have no supported caller.
3. Retire duplicate static clip/catalog libraries only after every caller uses the canonical registry or live API.
4. Add source contracts that forbid new direct social post/Reel writes outside approved atomic publishers.

## Wave 5: Verification And Release

1. Run focused migration, resolver, interaction, takedown, profile, saved-state, and caller-reachability tests.
2. Run the exact applicable repository guards and production build once on the final candidate.
3. Install any additive migration once with preflight, ledger readback, and post-install invariants.
4. Protected-merge through GitHub, verify the exact Vercel deployment identity, and run read-only live proof for aliases, takedowns, old links, stale storage, and engagement totals.

## Phase 2 Acceptance Gates

- Every retired historical identifier deterministically resolves to one durable winner or one fail-closed unavailable result.
- Engagement and attribution totals are preserved under a documented collision policy; no write can land on a loser.
- Takedowns and confirmed unavailability disappear from feed, profile, saved, deep-link, mounted-player, and cache surfaces.
- Ambiguous groups are quarantined with a reason and are never auto-merged.
- Confirmed obsolete direct writers, debug endpoints, and duplicate libraries have no remaining callers and are removed.
- Focused tests, required repository checks, protected merge, exact production identity, database readback, and live behavior proof all pass.
