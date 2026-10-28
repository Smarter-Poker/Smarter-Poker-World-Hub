-- TIER 1: retain fractional chip equivalents for bigint diamond amounts.
-- PostgreSQL integer division truncates 50 diamonds /100 diamonds per chip.
-- No financial record changes; only the service report calculation changes.
BEGIN;
DO $patch$
DECLARE original text; updated text;
BEGIN
 original:=pg_get_functiondef('public.fn_sp_digest_spins_spend(date)'::regprocedure);
 updated:=replace(replace(original,
 'COALESCE(b.extra_diamonds,0)/NULLIF(w.diamonds_per_chip,0)',
 'COALESCE(b.extra_diamonds,0)::numeric/NULLIF(w.diamonds_per_chip,0)'),
 'COALESCE(c.paid_diamonds,0)/NULLIF(w.diamonds_per_chip,0)',
 'COALESCE(c.paid_diamonds,0)::numeric/NULLIF(w.diamonds_per_chip,0)');
 IF updated=original OR updated NOT LIKE '%COALESCE(c.paid_diamonds,0)::numeric/%'
 OR updated NOT LIKE '%COALESCE(b.extra_diamonds,0)::numeric/%' THEN RAISE EXCEPTION 'Unexpected report arithmetic predecessor'; END IF;
 EXECUTE updated;
END $patch$;
COMMIT;
