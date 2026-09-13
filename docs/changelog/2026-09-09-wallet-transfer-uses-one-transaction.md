# Atomic Diamond Wallet Transfers

Phase 4 platform implementation, September 9, 2026. World Hub publication and authenticated review acceptance are verified. The separate Arena release gate remains open pending its final CI and live acceptance.

The shared Arena wallet now verifies an accepted friend's player ID, shows their Arena handle and asks for confirmation. A pending request is retained across modal close and refresh; retries ask for the same immutable database receipt. The platform transfer API delegates to the same authenticated RPC. No two-call debit/credit pair, compensation, scheduler or hard-coded account exemption is used.

The database locks both profiles deterministically, checks friendship and the current shared sending limits, and commits both journal legs, wallet updates, any recipient debt retirement and its receipt together. Custody and purchased refund collateral remain untouched. Purchased collateral already reserved in custody is not subtracted from available balance twice. Stream gifting remains unchanged. Receipts expose neither participant's balance or debt.

Production applied atomic_wallet_diamond_transfers as 20260909200327. Read-only verification found zero transfer rows, RLS enabled, authenticated execution permitted, anonymous execution refused and RPC body MD5 17fbc7ff2a9176d3cca3f94d91721292. No real-player transfer was made.

Verification: 28 isolated PostgreSQL assertions passed, including concurrent delivery, competing transfers, transfer versus the existing spend writer, debt retirement, injected journal rollback, immutable receipts and custody isolation. Ten focused Arena wallet tests and nine World Hub handler/invariant tests passed. The reserve-versus-transfer race also passed with one spend and conserved available plus custody funds. Prior Phase 3 test results are reused, not counted again.

World Hub PR #1696 merged as bddc1f2b45676cc6019f7001677b6d72515d0d50. Production health reported that exact revision at 20:30 UTC; the transfer route returned GET 405 as expected for POST-only handling. PR #1698 merged as f278b16737a8d7cf054f0935993cc62541f942c3, then production health reported that revision at approximately 20:49 UTC. Authenticated live review selected Smarter.Poker, entered one Diamond, opened the explicit final confirmation, and cancelled. No transfer was submitted. The isolated authenticated SQL suite verifies the committed transaction contract. Phase 3 engine adoption was independently verified at 21:05 UTC on 561eaa523829ef8ecbd6b11fffe946b6e53fd756, healthy with zero blocked settlements and ancestry containing its final repair.

Work scope follows Dan's September 9 instruction: concrete Phase 4 requirements only, reuse verified evidence, no duplicate optional suites or speculative hardening.
