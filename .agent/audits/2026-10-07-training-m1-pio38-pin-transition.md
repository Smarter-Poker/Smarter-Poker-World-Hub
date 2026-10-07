# Original Training M1 Pio 3.8 Source-Pin Transition

Phase 6 remains incomplete. This is the same single M1 bounded parent/Turn-child canary, not a backlog activation or a V31 qualification claim. The approved global header is untouched.

Protected source PR #2208 merged as `002cb37bbd89df86f4cc054fcf370f794b14f413`. The maintained builder verified its protected ancestry and exact four pipeline blobs against protected main `a6039ebf288bf7f6b787b7c4e9f034ad92050f72`; it emitted manifest `3115537d7169913cac08db6a40797af7b516e33d1e4faa8d51310704aaf58a25` with 107 Training contracts, 18 ChipEV contracts, seven separate ICM contracts and exactly two bounded targets for M1 partition 2/0.

The immutable reserved identities remain parent `2d7b403c-e4d3-4c20-bff8-ed5db7ecb50a` and child `21d75135-faa8-4c0d-acbe-91b55c98daf0`. Ranges, nodes, positions, rake, stacks, tree geometry and scientific thresholds are unchanged.

Production readback at 2026-10-07T05:24:41Z proved the old source authority was the only M1 authority, its exact bounded scope was active and M1 worker receipts were zero. The installed scope guard's MD5 was `5080a6fb62d078a04931e3389dda5942`. The transition refuses any different preimage or prior old-source receipt, serializes through the existing M1 advisory lock and blocks concurrent receipt writes. It preserves the original activation guards, permanently retires the unused incompatible source, holds its scope and activates only the corrected tuple. Recovery holds the new scope; it cannot unretire the old source.

Migration `20261007052243_training_m1_pio38_pin_transition.sql` SHA-256 is `16d589bde80d09603f6f65cd0e21934dcabf7f156086b0a5803ec0beb770957f`. Its function replacement preserves ownership and ACLs. Timeouts precede all DDL and locking. Isolated PostgreSQL 17 exercises successful replacement, duplicate refusal, old-receipt refusal, mid-transaction rollback and new-only recovery. The three wrapper unit regressions are enforced in Build Safety Gate, while the maintained catalog fixture runs in the existing PostgreSQL authority gate.

Merged source, production deployment, installed transition, signed worker execution, admitted exports and public/admin certificates are separate evidence states. No canary success or Phase 6 completion is claimed by this source change.
