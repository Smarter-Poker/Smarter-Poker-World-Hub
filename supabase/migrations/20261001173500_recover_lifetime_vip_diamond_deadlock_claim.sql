-- Recover the exact failed runner claim left by the rolled-back production
-- deadlock for 20261001173000_lifetime_vip_monthly_expiring_diamonds.sql.
-- TIER: 1 (runner control-ledger repair after verified transaction rollback)
-- AFFECTS: supabase_migrations.antigravity_migration_integrity only.
-- IRREVERSIBLE: no. Fresh databases and already-applied databases are no-ops.

BEGIN;

DO $recovery$
DECLARE
  v_claim record;
  v_canonical_exists boolean;
BEGIN
  IF to_regclass('supabase_migrations.antigravity_migration_integrity') IS NULL THEN
    RETURN;
  END IF;

  SELECT source_version, source_name, checksum, state, error_code
    INTO v_claim
    FROM supabase_migrations.antigravity_migration_integrity
   WHERE source_version = '20261001173000'
   FOR UPDATE;

  IF NOT FOUND OR v_claim.state = 'applied' THEN
    RETURN;
  END IF;

  IF v_claim.source_name IS DISTINCT FROM
       '20261001173000_lifetime_vip_monthly_expiring_diamonds.sql'
     OR v_claim.checksum IS DISTINCT FROM
       '4af47382272dc44445bf779ebc98518a9e879f5d17c57adab7e92c426a84aee1'
     OR v_claim.state <> 'failed'
     OR v_claim.error_code IS DISTINCT FROM '40P01' THEN
    RAISE EXCEPTION 'recovery refused: monthly Diamond claim identity/state is not the exact rolled-back deadlock';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM supabase_migrations.schema_migrations
     WHERE version = '20261001173000'
        OR idempotency_key =
          'sha256:4af47382272dc44445bf779ebc98518a9e879f5d17c57adab7e92c426a84aee1'
  ) INTO v_canonical_exists;

  IF v_canonical_exists
     OR EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'lifetime_vip_since'
     )
     OR to_regclass('public.lifetime_vip_diamond_lots') IS NOT NULL
     OR to_regclass('public.lifetime_vip_diamond_lot_allocations') IS NOT NULL
     OR to_regprocedure(
       'public.expire_lifetime_vip_diamond_lots_for_user(uuid,timestamptz)'
     ) IS NOT NULL
     OR to_regprocedure(
       'public.grant_lifetime_vip_monthly_diamonds(uuid,date)'
     ) IS NOT NULL
     OR EXISTS (
       SELECT 1
         FROM pg_trigger
        WHERE tgname IN (
          'trg_track_lifetime_vip_since',
          'trg_allocate_lifetime_vip_diamond_spend'
        )
          AND NOT tgisinternal
     )
  THEN
    RAISE EXCEPTION 'recovery refused: the deadlocked monthly Diamond migration has one or more committed postconditions';
  END IF;

  DELETE FROM supabase_migrations.antigravity_migration_integrity
   WHERE source_version = v_claim.source_version
     AND source_name = v_claim.source_name
     AND checksum = v_claim.checksum
     AND state = 'failed'
     AND error_code = '40P01';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recovery failed: exact monthly Diamond claim disappeared concurrently';
  END IF;
END
$recovery$;

COMMIT;

