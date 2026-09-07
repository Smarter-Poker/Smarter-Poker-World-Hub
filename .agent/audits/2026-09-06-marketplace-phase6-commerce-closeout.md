# Marketplace Phase 6 Commerce Closeout

Date: 2026-09-06

## Scope

This pass closed the remaining Marketplace purchase-authorization, package-catalog, Stripe-recovery, Club Shop administration, private receipt, and same-surface navigation gaps across Diamond Store and Club Shop. Printful connection remains deliberately deferred at the owner's request.

## Material Findings And Fixes

- Club Shop confirmation prices were not bound to the database debit. A new service-only five-argument purchase RPC compares the expected price before stock, wallet, purchase, or grant mutation. The four-argument compatibility function recovers the price stored in a Card redemption intent and otherwise takes one current server availability snapshot for pre-release callers.
- Diamond and Club Card checkout could rely on a fallback or cached package quote. Checkout now requires the current active database catalog before Stripe side effects, uses exact integer cents, rejects wallet-credit overflow, and requires review after catalog drift.
- The Diamond storefront and checkout could disagree after package additions, removals, repricing, bonuses, or renames. Server rendering, hydration refresh, and the immediate pre-purchase refresh now use one normalized database catalog contract. Fallback data keeps the page readable but cannot authorize payment.
- Ambiguous Stripe session creation could delete the pending recovery anchor. Durable request identities are now required for Diamond and merchandise checkout; ambiguous outcomes remain pending and recoverable, while definitive failures use owner/status/null-session compare-and-set cleanup.
- Mutable validation failures could become permanently cached behind an idempotency key. Marketplace routes now release only mutable failed claims while keeping successful responses replayable.
- Club Shop admin activation paths could enable prices above the Card-fundable package limit. Creation, update, and reactivation now check the current database-backed maximum and fail closed. Deactivation remains available during catalog outages.
- Club Card return verification previously depended on mutable catalog context. Private checkout status now verifies the owner and Stripe session from the purchase record, returns the authoritative wallet/result, and exposes a non-success review state when fulfillment is not terminal.
- Order history now retains direct Card-funded Club receipts while deduplicating the automatic Diamond redemption from the general list. Null external references are not silently discarded.
- Dynamic Marketplace copy is normalized at render and metadata boundaries. The Marketplace test contract verifies Title Case and rejects banned long bars.

## Accounting Boundary Decision

An initially proposed negative-wallet credit helper was rejected before deployment. Production validates nonnegative profile balances and records chargeback shortfalls in `diamond_debts`; replacing settlement or refund logic around a nonexistent negative balance would have created a debt-bypass risk. This release leaves the canonical refund, debt, DR7, DR8, DR9, purchase-lot, and provenance controls unchanged. System-wide debt netting would require a separate high-risk accounting decision and is outside this phase.

Club Shop Diamond purchases remain platform-owned burns. No club commission or club revenue credit is created.

## Database Release Evidence

- Migration file: `supabase/migrations/20260906183000_club_shop_price_authorization.sql`
- Production ledger version: `20260906183000`, name `club_shop_price_authorization`
- The Supabase MCP connector returned Unauthorized. Following the documented repository fallback and prior incident precedent, the exact single file was executed atomically through the already authenticated linked Supabase CLI, then only version `20260906183000` was marked applied. No bulk `db push`, historical rewrite, or unrelated migration was run.
- A full production transaction probe executed the migration and rolled it back before application.
- A post-apply probe confirmed both RPC signatures, all three validated catalog constraints, eight active valid packages, preserved authenticated read and service-role DML privileges, no anonymous catalog access, and service-only execution for the new RPC.
- A transaction probe selected an available real Club/member pair, submitted a deliberately stale expected price, received `price_changed`, and verified unchanged stock, wallet, and purchase counts.
- Security advisor findings stayed at 673 and performance findings stayed at 51, with zero findings related to the changed Marketplace objects before or after application.

## Verification

- Marketplace contract suite: 278 passed, 0 failed.
- Focused price, package, Stripe, accounting-boundary, and admin suite: 18 passed, 0 failed.
- PostgreSQL outer grammar: parsed successfully with `pgsql-parser@18.2.6`.
- Migration production rollback probe: passed.
- Migration post-apply assertions and price-drift transaction probe: passed.

Production application code and deployment evidence are completed by the sanctioned `scripts/git-safe-push.sh` release gate and its SHA verification.
