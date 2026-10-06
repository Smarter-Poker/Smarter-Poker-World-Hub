-- ============================================================================
-- 20261006014800_trivia_p9_12_advisor_hardening.sql
-- ============================================================================
-- TIER:        2
-- AUTHOR:      Codex Trivia phases 9-12 release lane
-- AFFECTS:     Phase 10 achievement awards, Phase 11 operator authority,
--              Phase 12 legacy reconciliation and cutover authority
-- IRREVERSIBLE: no
--
-- WHY:
--   Production advisor readback after the additive Phase 9-12 install found
--   thirteen intentionally sealed internal tables with RLS enabled but no
--   explicit policy, plus two new foreign keys without covering indexes.
--   The no-policy posture denied access but produced an avoidable ambiguity:
--   these tables are intentionally private, not unfinished.
--
-- HOW:
--   - Adds one explicit deny-all policy to every internal table while
--     preserving all existing grants and SECURITY DEFINER access paths.
--   - Adds the two exact covering indexes required by the new foreign keys.
--   - Verifies the policy predicates, roles, index columns and index validity
--     before committing.
-- ============================================================================

BEGIN;

DO $preflight$
DECLARE
  v_table text;
  v_tables constant text[] := ARRAY[
    'trivia_operator_roles_v1',
    'trivia_operator_grants_v1',
    'trivia_operator_events_v1',
    'trivia_incident_notes_v1',
    'trivia_operations_alert_episodes_v1',
    'trivia_operations_alert_events_v1',
    'trivia_legacy_tournament_snapshots_v1',
    'trivia_legacy_tournament_result_rows_v1',
    'trivia_competitive_test_wallets',
    'trivia_competitive_cutover_certificates',
    'trivia_p12_scheduler_bootstrap_authorizations',
    'trivia_pvp_recovery_leases',
    'trivia_pvp_recovery_runs'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF pg_catalog.to_regclass('public.' || v_table) IS NULL THEN
      RAISE EXCEPTION 'pre-flight failed: public.% is missing', v_table;
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_class c
       WHERE c.oid = pg_catalog.to_regclass('public.' || v_table)
         AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'pre-flight failed: public.% does not have RLS enabled', v_table;
    END IF;

    IF EXISTS (
      SELECT 1
        FROM pg_catalog.pg_policy p
       WHERE p.polrelid = pg_catalog.to_regclass('public.' || v_table)
         AND p.polname = 'trivia_internal_no_direct_access'
    ) THEN
      RAISE EXCEPTION 'pre-flight failed: deny policy already exists on public.%', v_table;
    END IF;
  END LOOP;

  IF pg_catalog.to_regclass(
      'public.trivia_achievement_awards_v2_definition_idx'
    ) IS NOT NULL
     OR pg_catalog.to_regclass(
      'public.trivia_operator_grants_v1_role_idx'
    ) IS NOT NULL THEN
    RAISE EXCEPTION 'pre-flight failed: covering index name already exists';
  END IF;
END
$preflight$;

DO $policies$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'trivia_operator_roles_v1',
    'trivia_operator_grants_v1',
    'trivia_operator_events_v1',
    'trivia_incident_notes_v1',
    'trivia_operations_alert_episodes_v1',
    'trivia_operations_alert_events_v1',
    'trivia_legacy_tournament_snapshots_v1',
    'trivia_legacy_tournament_result_rows_v1',
    'trivia_competitive_test_wallets',
    'trivia_competitive_cutover_certificates',
    'trivia_p12_scheduler_bootstrap_authorizations',
    'trivia_pvp_recovery_leases',
    'trivia_pvp_recovery_runs'
  ]::text[] LOOP
    EXECUTE pg_catalog.format(
      'CREATE POLICY trivia_internal_no_direct_access ON public.%I FOR ALL TO PUBLIC USING (false) WITH CHECK (false)',
      v_table
    );
  END LOOP;
END
$policies$;

CREATE INDEX trivia_achievement_awards_v2_definition_idx
  ON public.trivia_achievement_awards_v2
  (achievement_id, definition_version);

CREATE INDEX trivia_operator_grants_v1_role_idx
  ON public.trivia_operator_grants_v1 (role_key);

DO $postconditions$
DECLARE
  v_policy_count integer;
  v_award_index regclass := pg_catalog.to_regclass(
    'public.trivia_achievement_awards_v2_definition_idx'
  );
  v_grant_index regclass := pg_catalog.to_regclass(
    'public.trivia_operator_grants_v1_role_idx'
  );
BEGIN
  SELECT count(*)
    INTO v_policy_count
    FROM pg_catalog.pg_policy p
   WHERE p.polname = 'trivia_internal_no_direct_access'
     AND p.polcmd = '*'
     AND p.polroles = ARRAY[0::oid]
     AND pg_catalog.pg_get_expr(p.polqual, p.polrelid) = 'false'
     AND pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) = 'false'
     AND p.polrelid = ANY(ARRAY[
       'public.trivia_operator_roles_v1'::regclass,
       'public.trivia_operator_grants_v1'::regclass,
       'public.trivia_operator_events_v1'::regclass,
       'public.trivia_incident_notes_v1'::regclass,
       'public.trivia_operations_alert_episodes_v1'::regclass,
       'public.trivia_operations_alert_events_v1'::regclass,
       'public.trivia_legacy_tournament_snapshots_v1'::regclass,
       'public.trivia_legacy_tournament_result_rows_v1'::regclass,
       'public.trivia_competitive_test_wallets'::regclass,
       'public.trivia_competitive_cutover_certificates'::regclass,
       'public.trivia_p12_scheduler_bootstrap_authorizations'::regclass,
       'public.trivia_pvp_recovery_leases'::regclass,
       'public.trivia_pvp_recovery_runs'::regclass
     ]::oid[]);

  IF v_policy_count <> 13 THEN
    RAISE EXCEPTION 'post-apply failed: expected 13 exact deny policies, found %',
      v_policy_count;
  END IF;

  IF v_award_index IS NULL
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_index i
        WHERE i.indexrelid = v_award_index
          AND i.indisvalid
          AND i.indisready
     )
     OR pg_catalog.pg_get_indexdef(v_award_index)
        NOT LIKE '%(achievement_id, definition_version)%' THEN
    RAISE EXCEPTION 'post-apply failed: achievement definition FK index is invalid';
  END IF;

  IF v_grant_index IS NULL
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_index i
        WHERE i.indexrelid = v_grant_index
          AND i.indisvalid
          AND i.indisready
     )
     OR pg_catalog.pg_get_indexdef(v_grant_index) NOT LIKE '%(role_key)%' THEN
    RAISE EXCEPTION 'post-apply failed: operator role FK index is invalid';
  END IF;
END
$postconditions$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ROLLBACK (apply only as a new reviewed forward migration):
-- drop the two named indexes and the named policy from the thirteen tables.
-- No application rows or immutable receipts need to be changed.
