# Phase 1 Context

## User Journey

As a player, I want a newly discovered poker video to appear once as a playable Reel and as a linked social-feed post, so I can discover it safely without seeing duplicates or unrelated content.

As an operator, I want third-party embeds to bypass native downloading unless recorded rights explicitly permit it, so increasing content volume cannot amplify compliance and worker failures.

## Architectural Decision

Keep the existing `source_type` column as a compatibility field while introducing orthogonal canonical fields. New code reads the canonical fields. Compatibility values continue to support old clients during rollout.

Third-party YouTube media defaults to `youtube_embed` plus `embed_only`. Only `owned` and `licensed` records may enter the native processing queue.

Publication occurs through one security-definer PostgreSQL RPC. The RPC locks by canonical key, validates the source library row, writes the social post, lets the existing post-to-Reel mirror execute, verifies the mirror, and returns the same record on replays.

## Phase Boundary

Phase 1 prevents new damage and wires new publication correctly. Phase 2 owns full historical engagement-preserving duplicate consolidation, redirects, and removal of obsolete files. Phase 3 owns source-volume expansion.
