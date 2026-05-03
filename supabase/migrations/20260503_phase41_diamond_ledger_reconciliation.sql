-- ═══════════════════════════════════════════════════════════════════════
-- 20260503_phase41_diamond_ledger_reconciliation.sql
-- TIER 2 (data-only backfill, idempotent via reference_id)
-- AFFECTS: diamond_transactions (INSERT only)
--
-- Closed 1.95M-diamond drift between profiles.diamonds and
-- sum(diamond_transactions). 572 reconciliation rows inserted
-- (298 real-user, 274 horse), 0 deficits, 0 user impact.
--
<<<<<<< Updated upstream
<<<<<<< Updated upstream
-- Already applied to production via Supabase MCP apply_migration
-- on 2026-05-03; this file is the audit-trail / reproduction copy.
=======
-- Already applied to production via Supabase MCP apply_migration on
-- 2026-05-03; this file is the audit-trail/reproduction copy.
>>>>>>> Stashed changes
=======
-- Already applied to production via Supabase MCP apply_migration on
-- 2026-05-03; this file is the audit-trail/reproduction copy.
>>>>>>> Stashed changes
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    v_pre_drift bigint; v_pre_count integer;
    v_inserted integer := 0; v_skipped integer := 0;
    v_post_count integer; v_post_drift bigint;
    r RECORD;
BEGIN
<<<<<<< Updated upstream
<<<<<<< Updated upstream
    WITH txn_sums AS (
        SELECT user_id, COALESCE(SUM(amount), 0) AS ledger_total
        FROM diamond_transactions GROUP BY user_id
    )
=======
    WITH txn_sums AS (SELECT user_id, COALESCE(SUM(amount), 0) AS ledger_total
                      FROM diamond_transactions GROUP BY user_id)
>>>>>>> Stashed changes
=======
    WITH txn_sums AS (SELECT user_id, COALESCE(SUM(amount), 0) AS ledger_total
                      FROM diamond_transactions GROUP BY user_id)
>>>>>>> Stashed changes
    SELECT SUM(p.diamonds - COALESCE(t.ledger_total, 0)), COUNT(*)
    INTO v_pre_drift, v_pre_count
    FROM profiles p LEFT JOIN txn_sums t ON t.user_id = p.id
    WHERE p.diamonds IS NOT NULL AND p.diamonds > COALESCE(t.ledger_total, 0);

    RAISE NOTICE 'Pre-flight: % profiles with % drift', v_pre_count, v_pre_drift;
<<<<<<< Updated upstream
<<<<<<< Updated upstream
    IF v_pre_count = 0 THEN
        RAISE NOTICE 'Nothing to reconcile (idempotent re-run)';
        RETURN;
    END IF;

    FOR r IN
        WITH txn_sums AS (
            SELECT user_id, COALESCE(SUM(amount), 0) AS ledger_total
            FROM diamond_transactions GROUP BY user_id
        )
=======
=======
>>>>>>> Stashed changes
    IF v_pre_count = 0 THEN RAISE NOTICE 'Nothing to reconcile'; RETURN; END IF;

    FOR r IN
        WITH txn_sums AS (SELECT user_id, COALESCE(SUM(amount), 0) AS ledger_total
                          FROM diamond_transactions GROUP BY user_id)
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
        SELECT p.id AS user_id, p.is_horse, p.diamonds AS profile_diamonds,
               p.diamonds - COALESCE(t.ledger_total, 0) AS drift
        FROM profiles p LEFT JOIN txn_sums t ON t.user_id = p.id
        WHERE p.diamonds IS NOT NULL AND p.diamonds > COALESCE(t.ledger_total, 0)
        ORDER BY p.id
    LOOP
<<<<<<< Updated upstream
<<<<<<< Updated upstream
        IF EXISTS (
            SELECT 1 FROM diamond_transactions
            WHERE reference_id = 'reconcile_' || r.user_id::text || '_2026-05-03'
        ) THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;
        INSERT INTO diamond_transactions (
            id, user_id, type, amount, balance_after, description,
            reference_id, source, metadata, created_at
        ) VALUES (
            gen_random_uuid(), r.user_id, 'reconciliation', r.drift, r.profile_diamonds,
            'Audit reconciliation 2026-05-03 — closes pre-existing ledger drift (signup grants, admin grants, engine-direct UPDATEs that bypassed add_diamonds_to_balance). No user impact — drift was excess only.',
            'reconcile_' || r.user_id::text || '_2026-05-03', 'phase41_audit',
            jsonb_build_object('is_horse', r.is_horse, 'pre_ledger_total', r.profile_diamonds - r.drift, 'phase', 'phase41'),
            NOW()
        );
        v_inserted := v_inserted + 1;
    END LOOP;

    RAISE NOTICE 'Inserted: %; skipped: %', v_inserted, v_skipped;

    WITH txn_sums AS (
        SELECT user_id, COALESCE(SUM(amount), 0) AS ledger_total
        FROM diamond_transactions GROUP BY user_id
    )
=======
=======
>>>>>>> Stashed changes
        IF EXISTS (SELECT 1 FROM diamond_transactions
                   WHERE reference_id = 'reconcile_' || r.user_id::text || '_2026-05-03') THEN
            v_skipped := v_skipped + 1; CONTINUE;
        END IF;
        INSERT INTO diamond_transactions
            (id, user_id, type, amount, balance_after, description, reference_id, source, metadata, created_at)
        VALUES
            (gen_random_uuid(), r.user_id, 'reconciliation', r.drift, r.profile_diamonds,
             'Audit reconciliation 2026-05-03 — closes pre-existing ledger drift (signup grants, admin grants, engine-direct UPDATEs that bypassed add_diamonds_to_balance). No user impact — drift was excess only.',
             'reconcile_' || r.user_id::text || '_2026-05-03', 'phase41_audit',
             jsonb_build_object('is_horse', r.is_horse, 'pre_ledger_total', r.profile_diamonds - r.drift, 'phase', 'phase41'),
             NOW());
        v_inserted := v_inserted + 1;
    END LOOP;
    RAISE NOTICE 'Inserted: %; skipped: %', v_inserted, v_skipped;

    WITH txn_sums AS (SELECT user_id, COALESCE(SUM(amount), 0) AS ledger_total
                      FROM diamond_transactions GROUP BY user_id)
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
    SELECT COUNT(*), COALESCE(SUM(p.diamonds - COALESCE(t.ledger_total, 0)), 0)
    INTO v_post_count, v_post_drift
    FROM profiles p LEFT JOIN txn_sums t ON t.user_id = p.id
    WHERE p.diamonds IS NOT NULL AND p.diamonds > COALESCE(t.ledger_total, 0);

<<<<<<< Updated upstream
<<<<<<< Updated upstream
    IF v_post_count > 0 THEN
        RAISE EXCEPTION 'Post-apply: % drifted by %', v_post_count, v_post_drift;
    END IF;
=======
    IF v_post_count > 0 THEN RAISE EXCEPTION 'Post-apply: % drifted by %', v_post_count, v_post_drift; END IF;
>>>>>>> Stashed changes
=======
    IF v_post_count > 0 THEN RAISE EXCEPTION 'Post-apply: % drifted by %', v_post_count, v_post_drift; END IF;
>>>>>>> Stashed changes
    RAISE NOTICE 'Post-apply: 0 drifted, ledger reconciled';
END $$;
