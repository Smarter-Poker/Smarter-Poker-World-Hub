# Transaction-Owned Club Messenger Welcome

The previous implementation had no custom welcome settings. This change adds actor-owned, club-scoped templates and a deferred membership event that reads the final committed downline assignment. A private generation receipt prevents repeated callbacks from delivering twice. The native personal Messenger conversation and social_messages insert remain the transport; no scheduled sender or backfill exists.

Qualified against native PostgreSQL 17: pending requests, final referral attachment, owner fallback, inactive agent fallback, all five staff roles, scoped settings, revision conflict, request replay, duplicate member updates, new assignments, departure/rejoin, disabled templates without retroactive delivery, rollback after the deferred delivery runs, personal blocks, social restrictions, hierarchy labels, cross-club isolation, denied direct table/private RPC access and migration replay refusal.

The three new private tables have RLS with no browser grants and no foreign keys into hot tables. SECURITY DEFINER functions have explicit search paths; settings derive auth.uid(), while the verified relationship projection is service-role-only and called only after existing conversation authorization. Installation sends nothing to historical members and fails if the source was already installed. A commented stop procedure preserves delivered messages and receipts.

Production preflight read current columns, native message/membership triggers, restriction helper and installed migration history. Installation, hashes, grants, recorded version and live behavior remain separate evidence in the existing operator checkpoint. No production DDL probe or engine replacement is required.
