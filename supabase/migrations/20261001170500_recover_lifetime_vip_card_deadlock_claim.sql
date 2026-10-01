-- Recover the exact durable runner claim left by the rolled-back production
-- deadlock for 20261001170000_lifetime_vip_card_reversal_safety.sql.
-- TIER: 1 (runner control-ledger repair after verified transaction rollback)
-- AFFECTS: supabase_migrations.antigravity_migration_integrity only.
-- IRREVERSIBLE: no. Fresh databases and already-applied databases are no-ops.

BEGIN;

DO $recovery$
DECLARE
  v_claim record;
  v_canonical_exists boolean;
  v_settlement text;
BEGIN
  IF to_regclass('supabase_migrations.antigravity_migration_integrity') IS NULL THEN
    RETURN;
  END IF;

  SELECT source_version, source_name, checksum, state
    INTO v_claim
    FROM supabase_migrations.antigravity_migration_integrity
   WHERE source_version = '20261001170000'
   FOR UPDATE;

  IF NOT FOUND OR v_claim.state = 'applied' THEN
    RETURN;
  END IF;

  IF v_claim.source_name IS DISTINCT FROM
       '20261001170000_lifetime_vip_card_reversal_safety.sql'
     OR v_claim.checksum IS DISTINCT FROM
       '3fc024d79d2da09871fe49cee90478d13a7774fa8abe7dc7fc84eedd7e31d51c'
     OR v_claim.state <> 'in_progress' THEN
    RAISE EXCEPTION 'recovery refused: Lifetime Card claim identity/state is not the exact rolled-back attempt';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM supabase_migrations.schema_migrations
     WHERE version = '20261001170000'
        OR idempotency_key =
          'sha256:3fc024d79d2da09871fe49cee90478d13a7774fa8abe7dc7fc84eedd7e31d51c'
  ) INTO v_canonical_exists;

  SELECT p.prosrc
    INTO v_settlement
    FROM pg_proc p
   WHERE p.oid = to_regprocedure(
     'public.settle_vip_lifetime_card_purchase_atomic(uuid,text,text)'
   );

  IF v_canonical_exists
     OR EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'vip_lifetime_card_purchase_id'
     )
     OR EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vip_lifetime_purchases'
          AND column_name IN (
            'previous_is_vip', 'previous_vip_tier',
            'previous_vip_expires_at', 'refunded_amount_cents',
            'dispute_id', 'dispute_status', 'reversal_reason',
            'entitlement_acquired_at', 'reversed_at'
          )
     )
     OR to_regprocedure(
       'public.reconcile_vip_lifetime_card_reversal_atomic(uuid,integer,integer,text,text,integer)'
     ) IS NOT NULL
     OR to_regclass('public.vip_lifetime_purchases_payment_intent_uidx') IS NOT NULL
     OR EXISTS (
       SELECT 1
         FROM pg_trigger
        WHERE tgrelid = 'public.profiles'::regclass
          AND tgname = 'trg_clear_stale_lifetime_card_provenance'
          AND NOT tgisinternal
     )
     OR position('vip_lifetime_card_purchase_id = p_purchase_id' IN COALESCE(v_settlement, '')) > 0
  THEN
    RAISE EXCEPTION 'recovery refused: the deadlocked migration has one or more committed postconditions';
  END IF;

  DELETE FROM supabase_migrations.antigravity_migration_integrity
   WHERE source_version = v_claim.source_version
     AND source_name = v_claim.source_name
     AND checksum = v_claim.checksum
     AND state = 'in_progress';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recovery failed: exact Lifetime Card claim disappeared concurrently';
  END IF;
END
$recovery$;

COMMIT;

