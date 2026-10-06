-- 20261006022120_stable_admin_phase11_finance_records.sql
-- TIER: 2
-- AUTHOR: Codex
-- AFFECTS: Stable Admin finance records and export receipts
-- IRREVERSIBLE: no
--
-- Phase 7 rendered financial evidence but never created the durable records
-- its own contract requires. These tables are append-only operator evidence;
-- none of them changes a wallet, payout, tournament, seat or manifest.

BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.ca_ledger_day_manifests') IS NULL
     OR to_regclass('public.ca_operator_approvals') IS NULL
     OR to_regclass('public.notifications') IS NULL THEN
    RAISE EXCEPTION 'phase11 finance pre-flight: required source table is missing';
  END IF;
  IF to_regclass('public.ca_daily_closes') IS NOT NULL
     OR to_regclass('public.ca_operator_export_jobs') IS NOT NULL THEN
    RAISE EXCEPTION 'phase11 finance pre-flight: destination table already exists';
  END IF;
END
$preflight$;

CREATE TABLE public.ca_daily_closes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  close_day date NOT NULL UNIQUE,
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-fA-F]{64}$'),
  manifest_row_count bigint NOT NULL CHECK (manifest_row_count >= 0),
  manifest_net_amount numeric NOT NULL,
  exceptions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(exceptions) = 'array'),
  signed_by uuid NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  op_id uuid NOT NULL UNIQUE,
  approval_id uuid UNIQUE REFERENCES public.ca_operator_approvals(id),
  request_id text,
  CONSTRAINT ca_daily_closes_manifest_day_fk
    FOREIGN KEY (close_day) REFERENCES public.ca_ledger_day_manifests(day)
);

CREATE TABLE public.ca_weekly_revenue_digest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key text NOT NULL UNIQUE,
  window_start date,
  window_end date,
  gross_revenue numeric,
  net_revenue numeric,
  rake_revenue numeric,
  recipient_count integer NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  scheduler text NOT NULL DEFAULT 'Existing Digest Owner',
  outcome text NOT NULL DEFAULT 'recorded' CHECK (outcome IN ('recorded','partial','failed')),
  figures jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(figures) = 'object'),
  first_recorded_at timestamptz NOT NULL DEFAULT now(),
  last_recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ca_weekly_revenue_digest_recipients (
  notification_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.ca_weekly_revenue_digest_runs(id),
  recipient_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ca_club_pnl_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('club','union')),
  scope_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL CHECK (period_end >= period_start),
  source_function text NOT NULL,
  source_version text NOT NULL,
  financial_epoch_id bigint,
  includes_horses boolean NOT NULL DEFAULT true CHECK (includes_horses),
  result jsonb NOT NULL,
  restates_snapshot_id uuid REFERENCES public.ca_club_pnl_snapshots(id),
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  op_id uuid NOT NULL UNIQUE,
  request_id text
);

CREATE TABLE public.ca_operator_export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL,
  request_id text,
  surface text NOT NULL CHECK (length(surface) BETWEEN 1 AND 80),
  permission text NOT NULL CHECK (length(permission) BETWEEN 1 AND 80),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(filters) = 'object'),
  format text NOT NULL DEFAULT 'csv' CHECK (format = 'csv'),
  state text NOT NULL CHECK (state IN ('prepared','truncated','failed')),
  row_count bigint NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  complete boolean NOT NULL,
  content_sha256 text CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-fA-F]{64}$'),
  byte_size bigint CHECK (byte_size IS NULL OR byte_size >= 0),
  error_code text,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  op_id uuid NOT NULL UNIQUE
);

CREATE INDEX ca_daily_closes_signed_at_idx ON public.ca_daily_closes(signed_at DESC);
CREATE INDEX ca_weekly_revenue_digest_runs_window_idx ON public.ca_weekly_revenue_digest_runs(window_end DESC);
CREATE INDEX ca_club_pnl_snapshots_scope_idx ON public.ca_club_pnl_snapshots(scope, scope_id, period_end DESC);
CREATE INDEX ca_operator_export_jobs_requester_idx ON public.ca_operator_export_jobs(requester_id, prepared_at DESC);

ALTER TABLE public.ca_daily_closes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_weekly_revenue_digest_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_weekly_revenue_digest_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_club_pnl_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_operator_export_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ca_daily_closes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ca_weekly_revenue_digest_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ca_weekly_revenue_digest_recipients FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ca_club_pnl_snapshots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ca_operator_export_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.ca_daily_closes TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ca_weekly_revenue_digest_runs TO service_role;
GRANT SELECT, INSERT ON TABLE public.ca_weekly_revenue_digest_recipients TO service_role;
GRANT SELECT, INSERT ON TABLE public.ca_club_pnl_snapshots TO service_role;
GRANT SELECT, INSERT ON TABLE public.ca_operator_export_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.fn_ca_finance_records_are_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $fn$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END
$fn$;

CREATE TRIGGER ca_daily_closes_append_only
  BEFORE UPDATE OR DELETE ON public.ca_daily_closes
  FOR EACH ROW EXECUTE FUNCTION public.fn_ca_finance_records_are_append_only();
CREATE TRIGGER ca_weekly_revenue_digest_recipients_append_only
  BEFORE UPDATE OR DELETE ON public.ca_weekly_revenue_digest_recipients
  FOR EACH ROW EXECUTE FUNCTION public.fn_ca_finance_records_are_append_only();
CREATE TRIGGER ca_club_pnl_snapshots_append_only
  BEFORE UPDATE OR DELETE ON public.ca_club_pnl_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.fn_ca_finance_records_are_append_only();
CREATE TRIGGER ca_operator_export_jobs_append_only
  BEFORE UPDATE OR DELETE ON public.ca_operator_export_jobs
  FOR EACH ROW EXECUTE FUNCTION public.fn_ca_finance_records_are_append_only();

CREATE OR REPLACE FUNCTION public.fn_ca_capture_weekly_revenue_digest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_figures jsonb;
  v_run_key text;
  v_run_id uuid;
  v_inserted integer;
BEGIN
  IF COALESCE(NEW.data ->> 'kind', '') <> 'weekly_revenue_digest' THEN RETURN NEW; END IF;
  v_figures := COALESCE(NEW.data -> 'digest', NEW.data -> 'figures', '{}'::jsonb);
  IF jsonb_typeof(v_figures) <> 'object' THEN v_figures := '{}'::jsonb; END IF;
  v_run_key := COALESCE(NULLIF(NEW.data ->> 'run_id', ''), NULLIF(v_figures ->> 'run_id', ''), to_char(date_trunc('week', NEW.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD'));

  INSERT INTO public.ca_weekly_revenue_digest_runs (
    run_key, window_start, window_end, gross_revenue, net_revenue, rake_revenue,
    recipient_count, figures, first_recorded_at, last_recorded_at
  ) VALUES (
    v_run_key,
    COALESCE(NULLIF(v_figures ->> 'window_start', '')::date, date_trunc('week', NEW.created_at AT TIME ZONE 'UTC')::date),
    COALESCE(NULLIF(v_figures ->> 'window_end', '')::date, (date_trunc('week', NEW.created_at AT TIME ZONE 'UTC') + interval '6 days')::date),
    NULLIF(COALESCE(v_figures ->> 'gross_revenue', v_figures ->> 'gross'), '')::numeric,
    NULLIF(COALESCE(v_figures ->> 'net_revenue', v_figures ->> 'net'), '')::numeric,
    NULLIF(COALESCE(v_figures ->> 'rake_revenue', v_figures ->> 'rake'), '')::numeric,
    0, v_figures, NEW.created_at, NEW.created_at
  )
  ON CONFLICT (run_key) DO UPDATE SET
    last_recorded_at = GREATEST(public.ca_weekly_revenue_digest_runs.last_recorded_at, EXCLUDED.last_recorded_at),
    figures = CASE WHEN public.ca_weekly_revenue_digest_runs.figures = '{}'::jsonb THEN EXCLUDED.figures ELSE public.ca_weekly_revenue_digest_runs.figures END
  RETURNING id INTO v_run_id;

  INSERT INTO public.ca_weekly_revenue_digest_recipients(notification_id, run_id, recipient_id, recorded_at)
  VALUES (NEW.id, v_run_id, NEW.user_id, NEW.created_at)
  ON CONFLICT (notification_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 1 THEN
    UPDATE public.ca_weekly_revenue_digest_runs SET recipient_count = recipient_count + 1 WHERE id = v_run_id;
  END IF;
  RETURN NEW;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN
  INSERT INTO public.ca_weekly_revenue_digest_runs(run_key, outcome, figures, first_recorded_at, last_recorded_at)
  VALUES ('malformed:' || NEW.id::text, 'partial', jsonb_build_object('capture_error', SQLSTATE), NEW.created_at, NEW.created_at)
  ON CONFLICT (run_key) DO NOTHING;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER ca_capture_weekly_revenue_digest
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.fn_ca_capture_weekly_revenue_digest();

REVOKE ALL ON FUNCTION public.fn_ca_finance_records_are_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ca_capture_weekly_revenue_digest() FROM PUBLIC, anon, authenticated;

-- Existing evidence is preserved as one bounded run record per observed week.
INSERT INTO public.ca_weekly_revenue_digest_runs(run_key, window_start, window_end, recipient_count, figures, first_recorded_at, last_recorded_at)
SELECT to_char(date_trunc('week', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD'),
       date_trunc('week', created_at AT TIME ZONE 'UTC')::date,
       (date_trunc('week', created_at AT TIME ZONE 'UTC') + interval '6 days')::date,
       count(DISTINCT user_id)::integer,
       COALESCE((array_agg(COALESCE(data -> 'digest', data -> 'figures', '{}'::jsonb) ORDER BY created_at))[1], '{}'::jsonb),
       min(created_at), max(created_at)
FROM public.notifications
WHERE data @> '{"kind":"weekly_revenue_digest"}'::jsonb
GROUP BY date_trunc('week', created_at AT TIME ZONE 'UTC')
ON CONFLICT (run_key) DO NOTHING;

INSERT INTO public.ca_weekly_revenue_digest_recipients(notification_id, run_id, recipient_id, recorded_at)
SELECT n.id, r.id, n.user_id, n.created_at
FROM public.notifications n
JOIN public.ca_weekly_revenue_digest_runs r
  ON r.run_key = to_char(date_trunc('week', n.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD')
WHERE n.data @> '{"kind":"weekly_revenue_digest"}'::jsonb
ON CONFLICT (notification_id) DO NOTHING;

ALTER TABLE public.ca_operator_approvals DROP CONSTRAINT IF EXISTS ca_operator_approvals_kind_check;
ALTER TABLE public.ca_operator_approvals ADD CONSTRAINT ca_operator_approvals_kind_check
  CHECK (kind IN ('mint','burn','fund_club','cashout','fleet_policy','sanction','daily_close'));

CREATE OR REPLACE FUNCTION public.fn_ca_operator_request_daily_close(
  p_day date, p_manifest_sha256 text, p_requested_by uuid, p_exceptions jsonb,
  p_op_id uuid, p_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_policy public.ca_operator_policy%rowtype;
  v_existing public.ca_operator_approvals%rowtype;
  v_required boolean;
  v_status text;
  v_id uuid;
BEGIN
  IF p_day IS NULL OR p_manifest_sha256 !~ '^[0-9a-fA-F]{64}$' OR p_requested_by IS NULL OR p_op_id IS NULL THEN
    RAISE EXCEPTION 'fn_ca_operator_request_daily_close: invalid request';
  END IF;
  IF p_exceptions IS NULL OR jsonb_typeof(p_exceptions) <> 'array' THEN
    RAISE EXCEPTION 'fn_ca_operator_request_daily_close: exceptions must be an array';
  END IF;
  SELECT * INTO v_existing FROM public.ca_operator_approvals WHERE op_id = p_op_id::text;
  IF FOUND THEN
    IF v_existing.kind <> 'daily_close' OR v_existing.target_id <> p_day::text
       OR v_existing.payload ->> 'manifest_sha256' <> lower(p_manifest_sha256)
       OR COALESCE(v_existing.payload -> 'exceptions', '[]'::jsonb) <> p_exceptions THEN
      RETURN jsonb_build_object('ok', false, 'required', true, 'error', 'payload_mismatch', 'status', v_existing.status, 'approval_id', v_existing.id);
    END IF;
    RETURN jsonb_build_object('ok', v_existing.status IN ('approved','auto_approved','executed'), 'required', v_existing.status = 'pending', 'status', v_existing.status, 'approval_id', v_existing.id, 'already_executed', v_existing.status = 'executed');
  END IF;
  SELECT * INTO v_policy FROM public.ca_operator_policy WHERE id LIMIT 1;
  v_required := COALESCE(v_policy.approvals_enabled, false);
  IF v_required AND NOT public.fn_ca_operator_has_second_approver(p_requested_by, 'money.write')
     AND COALESCE(v_policy.allow_self_approve_when_alone, true) THEN v_required := false; END IF;
  v_status := CASE WHEN v_required THEN 'pending' ELSE 'auto_approved' END;
  INSERT INTO public.ca_operator_approvals(kind, status, requested_by, expires_at, target_type, target_id, reason, payload, op_id, request_id)
  VALUES ('daily_close', v_status, p_requested_by, now() + make_interval(mins => COALESCE(v_policy.approval_ttl_minutes, 1440)), 'ledger_day', p_day::text, 'Sign Daily Close', jsonb_build_object('day', p_day, 'manifest_sha256', lower(p_manifest_sha256), 'exceptions', p_exceptions), p_op_id::text, p_request_id)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'required', v_required, 'status', v_status, 'approval_id', v_id, 'already_executed', false);
END
$fn$;

CREATE OR REPLACE FUNCTION public.fn_ca_operator_sign_daily_close(
  p_day date, p_manifest_sha256 text, p_signed_by uuid, p_exceptions jsonb,
  p_op_id uuid, p_approval_id uuid, p_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_manifest public.ca_ledger_day_manifests%rowtype;
  v_approval public.ca_operator_approvals%rowtype;
  v_close public.ca_daily_closes%rowtype;
BEGIN
  SELECT * INTO v_close FROM public.ca_daily_closes WHERE op_id = p_op_id;
  IF FOUND THEN RETURN jsonb_build_object('ok', true, 'idempotent', true, 'close', to_jsonb(v_close)); END IF;
  SELECT * INTO v_approval FROM public.ca_operator_approvals WHERE id = p_approval_id FOR UPDATE;
  IF NOT FOUND OR v_approval.kind <> 'daily_close' OR v_approval.op_id <> p_op_id::text
     OR v_approval.status NOT IN ('approved','auto_approved','executed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'approval_not_released');
  END IF;
  SELECT * INTO v_manifest FROM public.ca_ledger_day_manifests WHERE day = p_day FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'manifest_not_found'); END IF;
  IF lower(v_manifest.sha256) <> lower(p_manifest_sha256) THEN RETURN jsonb_build_object('ok', false, 'error', 'manifest_changed'); END IF;
  INSERT INTO public.ca_daily_closes(close_day, manifest_sha256, manifest_row_count, manifest_net_amount, exceptions, signed_by, op_id, approval_id, request_id)
  VALUES (p_day, lower(p_manifest_sha256), v_manifest.row_count, v_manifest.net_amount, p_exceptions, p_signed_by, p_op_id, p_approval_id, p_request_id)
  RETURNING * INTO v_close;
  UPDATE public.ca_operator_approvals SET status = 'executed', executed_at = now(), result = jsonb_build_object('close_id', v_close.id, 'day', p_day)
  WHERE id = p_approval_id AND status <> 'executed';
  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'close', to_jsonb(v_close));
END
$fn$;

REVOKE ALL ON FUNCTION public.fn_ca_operator_request_daily_close(date,text,uuid,jsonb,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ca_operator_sign_daily_close(date,text,uuid,jsonb,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ca_operator_request_daily_close(date,text,uuid,jsonb,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ca_operator_sign_daily_close(date,text,uuid,jsonb,uuid,uuid,text) TO service_role;

DO $post$
BEGIN
  IF to_regprocedure('public.fn_ca_operator_request_daily_close(date,text,uuid,jsonb,uuid,text)') IS NULL
     OR to_regprocedure('public.fn_ca_operator_sign_daily_close(date,text,uuid,jsonb,uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'phase11 finance post-apply: daily close RPC missing';
  END IF;
END
$post$;

COMMIT;

-- ROLLBACK (apply as a new migration only): drop the Phase 11 trigger,
-- functions and five ca_* evidence tables; restore the prior approval-kind
-- constraint. No source financial row is changed by this migration.
