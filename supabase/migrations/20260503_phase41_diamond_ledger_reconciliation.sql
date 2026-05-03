-- Phase 41 — Diamond ledger reconciliation (audit-trail copy)
-- Already applied to production via Supabase MCP on 2026-05-03.
-- 572 reconciliation rows inserted, 1,945,149 💎 drift closed,
-- 0 user impact (all drift was excess direction).
-- See SMARTER-POKER-BUILD-TRACKER.md PHASE 41.
DO $$ DECLARE r RECORD; v_inserted integer := 0;
BEGIN
    FOR r IN
        WITH txn_sums AS (SELECT user_id, COALESCE(SUM(amount), 0) AS lt FROM diamond_transactions GROUP BY user_id)
        SELECT p.id AS user_id, p.is_horse, p.diamonds AS pd, p.diamonds - COALESCE(t.lt, 0) AS drift
        FROM profiles p LEFT JOIN txn_sums t ON t.user_id = p.id
        WHERE p.diamonds IS NOT NULL AND p.diamonds > COALESCE(t.lt, 0) ORDER BY p.id
    LOOP
        IF NOT EXISTS (SELECT 1 FROM diamond_transactions WHERE reference_id = 'reconcile_' || r.user_id::text || '_2026-05-03') THEN
            INSERT INTO diamond_transactions (id, user_id, type, amount, balance_after, description, reference_id, source, metadata, created_at)
            VALUES (gen_random_uuid(), r.user_id, 'reconciliation', r.drift, r.pd,
                'Audit reconciliation 2026-05-03 — closes pre-existing ledger drift',
                'reconcile_' || r.user_id::text || '_2026-05-03', 'phase41_audit',
                jsonb_build_object('is_horse', r.is_horse, 'pre_ledger_total', r.pd - r.drift, 'phase', 'phase41'), NOW());
            v_inserted := v_inserted + 1;
        END IF;
    END LOOP;
    RAISE NOTICE 'Inserted: %', v_inserted;
END $$;
