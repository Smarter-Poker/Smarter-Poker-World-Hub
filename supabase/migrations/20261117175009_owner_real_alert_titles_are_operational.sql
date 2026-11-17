-- @live-proof: position('''3 AM Lobby Close Keeps Failing''' in pg_get_functiondef('public.fn_is_platform_operational_alert(text,text,jsonb)'::regprocedure)) > 0
-- 20261117175009_owner_real_alert_titles_are_operational.sql
--
-- TIER 2: notification routing only. No game, wallet, ledger or accounting row
-- is read or written.
--
-- WHAT WAS WRONG (read from rows, 2026-11-17):
-- Dan, 2026-10-09 and 2026-10-31: operational alerts go to Production Alerts and
-- are never pushed to his phone. The push guard
-- public.fn_platform_push_recipient_guard skips a push_outbox row only when
-- public.fn_is_platform_operational_alert(event, title, '{}') is true, and for a
-- 'system' row that test is a fixed TITLE list.
--
-- Club Arena's public.fn_ca_a_real_alert_reaches_the_owner() (the
-- zz_a_real_alert_reaches_the_owner trigger on operational_alert_events) raises
-- a 'system' notification with one of six titles. Three of them were in the
-- list (Tables Have Stopped Dealing, Engine Restart Storm, Money Check Failed)
-- and three were not:
--     'Engine Update Missed At 4 AM'   (kind releases)
--     'Merged Migration Not Installed' (kind migrations)
--     '3 AM Lobby Close Keeps Failing' (kind daily_window)
-- So those three reached the owner's phone: push_outbox holds 19 such rows with
-- status 'sent' between 2026-11-09 05:25Z and 2026-11-17 10:30Z, while the
-- listed titles were skipped with failure_reason 'routed_to_production_alerts'.
--
-- THE FIX:
-- One guarded anchor amendment of the live definition adds the three titles to
-- the operational title list. Same pattern as every other routing amendment:
-- the anchor must occur exactly once, a replay is a no-op, owner and ACL are
-- kept by CREATE OR REPLACE, and the result is read back before COMMIT.
-- The JavaScript mirror (src/lib/notifications/deliveryPolicy.mjs) carries the
-- same titles, and __tests__/owner-real-alert-titles-are-operational.test.mjs
-- refuses any owner-real-alert title that either side does not classify.
--
-- Proved in production 2026-11-17 by a self-aborting DO block that compiled the
-- amended definition as pg_temp.probe_op and raised: anchors=1, the three titles
-- true, 'Money Check Failed' and 'Push Health Alert' still true, 'Daily Digest:
-- x', a weekly-rakeback title and (new_message, 'Merged Migration Not Installed')
-- still false. Nothing committed. No object depends on the function.
--
-- Rows already in push_outbox are not touched: they were delivered and are
-- history. The in-app notification row is unchanged (owner 2026-10-31: "the
-- in-app notification and the operational_alert_events record are untouched;
-- only the device push is skipped").

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $migration$
DECLARE
  v_sig regprocedure := 'public.fn_is_platform_operational_alert(text,text,jsonb)'::regprocedure;
  v_def text;
  v_anchor text := '''Tournament Schedule Active'')';
  v_replacement text := '''Tournament Schedule Active'',''Engine Update Missed At 4 AM'',''Merged Migration Not Installed'',''3 AM Lobby Close Keeps Failing'')';
BEGIN
  v_def := pg_get_functiondef(v_sig);
  IF position(v_replacement IN v_def) > 0 THEN RETURN; END IF;
  IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'fn_is_platform_operational_alert: expected exactly one operational title list to amend';
  END IF;
  EXECUTE replace(v_def, v_anchor, v_replacement);
  IF NOT (public.fn_is_platform_operational_alert('system', 'Engine Update Missed At 4 AM', '{}'::jsonb)
      AND public.fn_is_platform_operational_alert('system', 'Merged Migration Not Installed', '{}'::jsonb)
      AND public.fn_is_platform_operational_alert('system', '3 AM Lobby Close Keeps Failing', '{}'::jsonb)
      AND public.fn_is_platform_operational_alert('system', 'Money Check Failed', '{}'::jsonb)
      AND NOT public.fn_is_platform_operational_alert('new_message', 'Merged Migration Not Installed', '{}'::jsonb)
      AND NOT public.fn_is_platform_operational_alert('system', 'Daily Digest: 1 Signups', '{}'::jsonb)) THEN
    RAISE EXCEPTION 'fn_is_platform_operational_alert: owner real-alert titles did not classify as operational';
  END IF;
END
$migration$;
COMMIT;
