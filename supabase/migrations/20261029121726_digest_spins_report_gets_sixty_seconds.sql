-- TIER 1: read-only service report limit. No financial rows, no function body and no grants change.
--
-- The Oct 28 digest (sent 2026-10-29 07:01 Central) printed "Diamond Spins and
-- Spend: canceling statement due to statement timeout". fn_sp_digest_spins_spend
-- carried a 20 s limit while its sibling reports (player report, player totals,
-- the digest itself) carry 60 s. It normally takes under a second to a few
-- seconds, but at the top of the hour the same database is also running the
-- hourly crons and the digest's other reports, and a cancelled report leaves
-- the card empty. The sender now retries a cancelled report and loads the
-- data once for all admins; this gives the report the same ceiling as the others.
BEGIN;
ALTER FUNCTION public.fn_sp_digest_spins_spend(date) SET statement_timeout = '60s';
COMMIT;
