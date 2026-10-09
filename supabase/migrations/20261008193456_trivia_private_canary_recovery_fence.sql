-- TIER: 2; AUTHOR: Codex; AFFECTS: one scoped private canary recovery fence and existing named-human access
-- WHY: The finite original input lost its lease during interruption. Preserve released fence2,
-- expired unused paid authorization, original human answers and charged holds. Resume three
-- zero events; original missed-start paths refund both old paid events. A single fresh
-- real-clock paid event qualifies settlement separately. No public flag/certificate/clock changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
BEGIN
IF NOT EXISTS(SELECT 1 FROM public.trivia_tournament_scheduler_leases WHERE fencing_token=2 AND holder_id='qualification:oct8-human-zero-canaries' AND released_at IS NOT NULL AND expires_at<clock_timestamp()) THEN RAISE EXCEPTION 'prior lease not released expired2'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.trivia_tournament_scheduler_runs WHERE run_id='9e260584-c7c6-48ef-a80b-2d8839c4e2d5' AND fencing_token=2 AND finished_at IS NOT NULL) THEN RAISE EXCEPTION 'prior run incomplete'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.trivia_p12_scheduler_bootstrap_authorizations WHERE authorization_id='b6978a10-990b-47e4-be9f-498d36edc6d2' AND expected_fencing_token=3 AND consumed_run_id IS NULL AND expires_at<clock_timestamp()) THEN RAISE EXCEPTION 'expired authorization history changed'; END IF;
IF EXISTS(SELECT 1 FROM public.trivia_p12_scheduler_bootstrap_authorizations WHERE holder_id='qualification:oct8-canary-recovery') THEN RAISE EXCEPTION 'recovery already authorized; read durable outcome'; END IF;
IF (SELECT count(*) FROM public.trivia_tournaments WHERE id IN ('6062f650-9b21-40d1-a34b-5c1dad34b762','1d403b1c-063c-4908-8b6c-dbf947ec5fd7','fd1125a0-8bc5-455f-8cb7-73a94b6cd9ef') AND schedule_kind='canary' AND entry_fee=0 AND lifecycle_state='live')<>3 THEN RAISE EXCEPTION 'zero recovery scope changed'; END IF;
IF (SELECT count(*) FROM public.trivia_tournaments WHERE id IN ('35e9bbe9-2831-4458-96af-6d4f450ec62c','53e0c2ab-3633-4578-a76b-cb3cda0fad4b') AND schedule_kind='canary' AND entry_fee=10 AND lifecycle_state='registration' AND start_time<clock_timestamp()-interval '600 seconds')<>2 THEN RAISE EXCEPTION 'original paid refund scope changed'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.trivia_tournaments WHERE id='0c20a48c-14f8-47be-b6ed-c9d73bc7d728' AND schedule_kind='canary' AND entry_fee=10 AND horse_target=70 AND lifecycle_state='registration' AND start_time>clock_timestamp()) THEN RAISE EXCEPTION 'fresh paid event not future'; END IF;
IF NOT public.trivia_competitive_test_wallet_active_at_v1('a379dc08-375e-4bcd-96f7-10e96a8a5c65',clock_timestamp()) THEN RAISE EXCEPTION 'named wallet inactive'; END IF;
IF EXISTS(SELECT 1 FROM (SELECT DISTINCT ON(gate_key) enabled FROM public.trivia_competitive_cutover_certificates ORDER BY gate_key,certificate_version DESC) gates WHERE enabled) THEN RAISE EXCEPTION 'public gates changed'; END IF;
INSERT INTO public.trivia_tournament_canary_access(tournament_id,user_id,approved_by) VALUES('0c20a48c-14f8-47be-b6ed-c9d73bc7d728','a379dc08-375e-4bcd-96f7-10e96a8a5c65','Codex /root exact named ten-Diamond real-clock settlement qualification');
INSERT INTO public.trivia_p12_scheduler_bootstrap_authorizations(job_identity,holder_id,expected_fencing_token,reason,created_by,expires_at) VALUES('openclaw:trivia-nightly-tournament','qualification:oct8-canary-recovery',3,'Only resume original three named-human zero canaries, original missed-start refund two paid canaries, and single real-clock paid70 settlement 0c20a48c-14f8-47be-b6ed-c9d73bc7d728; no full scheduler or public activation.','Codex /root launch qualification',clock_timestamp()+interval '30 minutes');
IF (SELECT count(*) FROM public.trivia_p12_scheduler_bootstrap_authorizations WHERE holder_id='qualification:oct8-canary-recovery' AND expected_fencing_token=3 AND consumed_run_id IS NULL)<>1 THEN RAISE EXCEPTION 'recovery authorization mismatch'; END IF;
END $guard$;
COMMIT;
-- Rollback: retain immutable history; unused authorization expires within30minutes.
-- Acquired original run must release once through actual run UUID/fence3.
-- Public scheduler remains refused. Never delete prior authorization, lease or financial history.
