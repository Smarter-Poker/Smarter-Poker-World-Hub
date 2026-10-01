-- trivia_p2_ledger_foundation
--
-- Trivia Casino Realism, Phase 2: versioned rules registry, a balanced trivia journal whose
-- wallet legs link 1:1 to the platform diamond journal (diamond_transactions), atomic and
-- idempotent money operations, the settlement foundation, reconciliation views and ledger
-- health. ADDITIVE ONLY: no live caller is switched here and no diamonds move. Balances keep
-- changing only through add_diamonds_to_balance / deduct_diamonds (DR6). Postconditions are
-- asserted at the end; any failure rolls the whole migration back.

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------------------------
-- 0. Shared helpers
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_ledger_raise(p_code text, p_detail jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'TL001', MESSAGE = p_code, DETAIL = COALESCE(p_detail, '{}'::jsonb)::text;
END $fn$;

CREATE OR REPLACE FUNCTION public.trivia_ledger_refuse_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
BEGIN
  RAISE EXCEPTION 'trivia ledger: % on % is refused; the record is append-only (correct it with a reversal or an approved repair journal)',
    TG_OP, TG_TABLE_NAME USING ERRCODE = 'TL002';
END $fn$;

CREATE OR REPLACE FUNCTION public.trivia_ledger_sha256(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = public, pg_temp AS $fn$
  SELECT encode(sha256(convert_to(p_text, 'UTF8')), 'hex');
$fn$;

-- ---------------------------------------------------------------------------------------------
-- 1. Versioned rules registry (immutable versions + a current pointer with history)
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trivia_rules_versions (
  id text PRIMARY KEY,
  rules_key text NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  family text NOT NULL CHECK (family IN ('solo', 'pvp', 'tournament')),
  mode text NOT NULL,
  provisional boolean NOT NULL,
  approval_source text NOT NULL CHECK (length(btrim(approval_source)) > 0),
  rules_canonical text NOT NULL,
  rules jsonb GENERATED ALWAYS AS (rules_canonical::jsonb) STORED,
  rules_sha256 text NOT NULL CHECK (rules_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rules_key, version),
  CHECK (id = rules_key || '@' || version::text)
);

CREATE TABLE IF NOT EXISTS public.trivia_rules_current (
  rules_key text PRIMARY KEY,
  rules_version_id text NOT NULL REFERENCES public.trivia_rules_versions(id),
  reason text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trivia_rules_current_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rules_key text NOT NULL,
  rules_version_id text NOT NULL,
  previous_version_id text,
  reason text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by text NOT NULL DEFAULT session_user
);

CREATE OR REPLACE FUNCTION public.trivia_rules_current_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'trivia rules: the current pointer for % cannot be deleted', OLD.rules_key USING ERRCODE = 'TL002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trivia_rules_versions v
                  WHERE v.id = NEW.rules_version_id AND v.rules_key = NEW.rules_key) THEN
    RAISE EXCEPTION 'trivia rules: % is not a version of %', NEW.rules_version_id, NEW.rules_key USING ERRCODE = 'TL002';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.rules_key IS DISTINCT FROM OLD.rules_key THEN
    RAISE EXCEPTION 'trivia rules: a pointer key is immutable' USING ERRCODE = 'TL002';
  END IF;
  INSERT INTO public.trivia_rules_current_history (rules_key, rules_version_id, previous_version_id, reason)
  VALUES (NEW.rules_key, NEW.rules_version_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.rules_version_id END, NEW.reason);
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_trivia_rules_versions_immutable ON public.trivia_rules_versions;
CREATE TRIGGER trg_trivia_rules_versions_immutable BEFORE UPDATE OR DELETE ON public.trivia_rules_versions
  FOR EACH ROW EXECUTE FUNCTION public.trivia_ledger_refuse_mutation();
DROP TRIGGER IF EXISTS trg_trivia_rules_versions_no_truncate ON public.trivia_rules_versions;
CREATE TRIGGER trg_trivia_rules_versions_no_truncate BEFORE TRUNCATE ON public.trivia_rules_versions
  FOR EACH STATEMENT EXECUTE FUNCTION public.trivia_ledger_refuse_mutation();
DROP TRIGGER IF EXISTS trg_trivia_rules_current_guard ON public.trivia_rules_current;
CREATE TRIGGER trg_trivia_rules_current_guard BEFORE INSERT OR UPDATE OR DELETE ON public.trivia_rules_current
  FOR EACH ROW EXECUTE FUNCTION public.trivia_rules_current_guard();
DROP TRIGGER IF EXISTS trg_trivia_rules_current_history_immutable ON public.trivia_rules_current_history;
CREATE TRIGGER trg_trivia_rules_current_history_immutable BEFORE UPDATE OR DELETE ON public.trivia_rules_current_history
  FOR EACH ROW EXECUTE FUNCTION public.trivia_ledger_refuse_mutation();

-- ---------------------------------------------------------------------------------------------
-- 2. Accounts, journal headers and lines
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trivia_ledger_accounts (
  account_code text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('player_wallet', 'treasury', 'pvp_escrow', 'tournament_escrow',
                                     'house_revenue', 'refund_liability', 'platform_issuance', 'legacy_suspense')),
  user_id uuid,
  subject_id uuid,
  tracks_balance boolean NOT NULL,
  balance bigint NOT NULL DEFAULT 0,
  min_balance bigint,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by_journal_id uuid,
  CHECK (min_balance IS NULL OR balance >= min_balance),
  CHECK (tracks_balance OR balance = 0),
  CHECK ((state = 'closed') = (closed_at IS NOT NULL)),
  CHECK (state = 'open' OR balance = 0),
  CHECK (
       (kind = 'player_wallet' AND user_id IS NOT NULL AND account_code = 'wallet:' || user_id::text AND NOT tracks_balance)
    OR (kind = 'treasury' AND account_code = 'treasury:trivia' AND tracks_balance)
    OR (kind = 'pvp_escrow' AND subject_id IS NOT NULL AND account_code = 'escrow:pvp:' || subject_id::text AND tracks_balance)
    OR (kind = 'tournament_escrow' AND subject_id IS NOT NULL AND account_code = 'escrow:tournament:' || subject_id::text AND tracks_balance)
    OR (kind = 'house_revenue' AND account_code IN ('house:rake:pvp', 'house:rake:tournament', 'house:entry:solo', 'house:spend:lifeline') AND tracks_balance)
    OR (kind = 'refund_liability' AND user_id IS NOT NULL AND account_code = 'liability:refund:' || user_id::text AND tracks_balance)
    OR (kind = 'platform_issuance' AND account_code IN ('issuance:trivia_run', 'issuance:trivia_daily_bonus', 'issuance:trivia_prize_wheel', 'issuance:treasury_funding') AND tracks_balance)
    OR (kind = 'legacy_suspense' AND account_code = 'suspense:legacy' AND tracks_balance)
  )
);

CREATE TABLE IF NOT EXISTS public.trivia_ledger_journals (
  id uuid PRIMARY KEY,
  journal_seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  idempotency_key text NOT NULL UNIQUE CHECK (idempotency_key ~ '^[A-Za-z0-9_:.@-]{8,200}$'),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  operation text NOT NULL CHECK (operation IN ('hold', 'release', 'debit', 'subsidy', 'rake', 'payout', 'refund',
                                               'reversal', 'repair', 'treasury_fund', 'settlement', 'backfill')),
  source_event text NOT NULL,
  source_type text,
  source_id text,
  subject_type text CHECK (subject_type IN ('pvp_match', 'tournament', 'trivia_session')),
  subject_id uuid,
  settlement_id uuid,
  rules_version_id text REFERENCES public.trivia_rules_versions(id),
  actor_kind text NOT NULL CHECK (actor_kind IN ('human', 'horse', 'system', 'operator')),
  actor_id uuid,
  funding_source text NOT NULL CHECK (funding_source IN ('player_wallet', 'treasury', 'escrow', 'platform_issuance',
                                                         'house_revenue', 'refund_liability', 'legacy', 'mixed')),
  line_count integer NOT NULL CHECK (line_count >= 2),
  total_debit bigint NOT NULL CHECK (total_debit > 0),
  total_credit bigint NOT NULL,
  reverses_journal_id uuid UNIQUE REFERENCES public.trivia_ledger_journals(id),
  approval jsonb,
  request jsonb NOT NULL,
  result jsonb NOT NULL,
  caller_role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (total_debit = total_credit),
  CHECK ((operation = 'reversal') = (reverses_journal_id IS NOT NULL)),
  CHECK (operation NOT IN ('reversal', 'repair', 'treasury_fund')
         OR (jsonb_typeof(approval) = 'object'
             AND length(btrim(COALESCE(approval ->> 'approved_by', ''))) > 0
             AND length(btrim(COALESCE(approval ->> 'reason', ''))) > 0
             AND length(btrim(COALESCE(approval ->> 'evidence', ''))) > 0))
);

CREATE TABLE IF NOT EXISTS public.trivia_ledger_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  journal_id uuid NOT NULL REFERENCES public.trivia_ledger_journals(id),
  line_no integer NOT NULL CHECK (line_no >= 1),
  account_code text NOT NULL REFERENCES public.trivia_ledger_accounts(account_code),
  account_kind text NOT NULL,
  amount bigint NOT NULL CHECK (amount <> 0),
  balance_before bigint,
  balance_after bigint,
  user_id uuid,
  participant_kind text CHECK (participant_kind IN ('human', 'horse')),
  wallet_reference text,
  wallet_kind text,
  diamond_transaction_id uuid,
  platform_receipt jsonb,
  memo text,
  reconciliation_state text NOT NULL CHECK (reconciliation_state IN ('linked', 'internal', 'legacy_linked')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (journal_id, line_no),
  CHECK (balance_before IS NULL OR balance_after IS NULL OR balance_after = balance_before + amount),
  CHECK ((account_kind = 'player_wallet') = (wallet_reference IS NOT NULL)),
  CHECK (account_kind <> 'player_wallet'
         OR (diamond_transaction_id IS NOT NULL AND wallet_kind IS NOT NULL AND user_id IS NOT NULL
             AND reconciliation_state IN ('linked', 'legacy_linked'))),
  CHECK (account_kind = 'player_wallet' OR (reconciliation_state = 'internal' AND diamond_transaction_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS trivia_ledger_lines_wallet_reference_uidx
  ON public.trivia_ledger_lines (wallet_reference) WHERE wallet_reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS trivia_ledger_lines_platform_row_uidx
  ON public.trivia_ledger_lines (diamond_transaction_id) WHERE diamond_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS trivia_ledger_lines_account_created_idx ON public.trivia_ledger_lines (account_code, created_at);
CREATE INDEX IF NOT EXISTS trivia_ledger_lines_user_idx ON public.trivia_ledger_lines (user_id, created_at) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS trivia_ledger_journals_subject_idx ON public.trivia_ledger_journals (subject_type, subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS trivia_ledger_journals_created_idx ON public.trivia_ledger_journals (created_at);

-- ---------------------------------------------------------------------------------------------
-- 3. Settlement foundation
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trivia_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('pvp_match', 'tournament')),
  subject_id uuid NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  rules_version_id text NOT NULL REFERENCES public.trivia_rules_versions(id),
  escrow_account_code text NOT NULL UNIQUE REFERENCES public.trivia_ledger_accounts(account_code),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'locked', 'settled', 'refunded', 'voided')),
  outcome text CHECK (outcome IN ('win', 'tie', 'forfeit', 'refund', 'void', 'prizes', 'cancelled')),
  held_total bigint NOT NULL DEFAULT 0 CHECK (held_total >= 0),
  subsidy_total bigint NOT NULL DEFAULT 0 CHECK (subsidy_total >= 0),
  released_total bigint NOT NULL DEFAULT 0 CHECK (released_total >= 0),
  refunded_total bigint NOT NULL DEFAULT 0 CHECK (refunded_total >= 0),
  rake_amount bigint NOT NULL DEFAULT 0 CHECK (rake_amount >= 0),
  paid_total bigint NOT NULL DEFAULT 0 CHECK (paid_total >= 0),
  gross_pool bigint CHECK (gross_pool >= 0),
  final_prize_pool bigint CHECK (final_prize_pool >= 0),
  plan jsonb,
  plan_hash text,
  result jsonb,
  settlement_journal_id uuid REFERENCES public.trivia_ledger_journals(id),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  locked_at timestamptz,
  terminal_at timestamptz,
  UNIQUE (subject_type, subject_id),
  CHECK (state = 'open' OR gross_pool IS NOT NULL),
  CHECK ((state IN ('settled', 'refunded', 'voided')) = (terminal_at IS NOT NULL)),
  CHECK (state NOT IN ('settled', 'refunded', 'voided') OR (outcome IS NOT NULL AND plan_hash IS NOT NULL AND final_prize_pool IS NOT NULL))
);

DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trivia_ledger_journals_settlement_fkey') THEN
    ALTER TABLE public.trivia_ledger_journals
      ADD CONSTRAINT trivia_ledger_journals_settlement_fkey FOREIGN KEY (settlement_id) REFERENCES public.trivia_settlements(id);
  END IF;
END $do$;

CREATE TABLE IF NOT EXISTS public.trivia_settlement_participants (
  settlement_id uuid NOT NULL REFERENCES public.trivia_settlements(id),
  user_id uuid NOT NULL,
  participant_kind text NOT NULL CHECK (participant_kind IN ('human', 'horse')),
  funding_source text NOT NULL CHECK (funding_source IN ('player_wallet', 'treasury')),
  entry_amount bigint NOT NULL CHECK (entry_amount > 0),
  hold_journal_id uuid NOT NULL REFERENCES public.trivia_ledger_journals(id),
  hold_reference text NOT NULL,
  state text NOT NULL DEFAULT 'held' CHECK (state IN ('held', 'released', 'refunded', 'settled')),
  rake_share bigint CHECK (rake_share >= 0),
  net_contribution bigint CHECK (net_contribution >= 0),
  payout_amount bigint NOT NULL DEFAULT 0 CHECK (payout_amount >= 0),
  refund_amount bigint NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  final_rank integer,
  result jsonb,
  exit_journal_id uuid REFERENCES public.trivia_ledger_journals(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (settlement_id, user_id),
  CHECK (participant_kind = 'human' OR funding_source = 'treasury'),
  CHECK (state NOT IN ('released', 'refunded') OR refund_amount = entry_amount)
);
CREATE INDEX IF NOT EXISTS trivia_settlement_participants_treasury_idx
  ON public.trivia_settlement_participants (settlement_id) WHERE funding_source = 'treasury' AND state = 'held';
CREATE INDEX IF NOT EXISTS trivia_settlement_participants_user_idx ON public.trivia_settlement_participants (user_id);

CREATE TABLE IF NOT EXISTS public.trivia_settlement_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  settlement_id uuid NOT NULL REFERENCES public.trivia_settlements(id),
  event text NOT NULL,
  from_state text,
  to_state text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS trivia_settlement_events_settlement_idx ON public.trivia_settlement_events (settlement_id, at);

-- ---------------------------------------------------------------------------------------------
-- 4. Configuration, switches, idempotency and health evidence
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trivia_ledger_config (
  key text PRIMARY KEY CHECK (key IN ('treasury_floor', 'treasury_daily_subsidy_ceiling', 'treasury_exposure_ceiling',
                                      'treasury_warning_level', 'pvp_settlement_slo_seconds', 'tournament_settlement_slo_seconds')),
  value bigint NOT NULL CHECK (value >= 0),
  reason text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.trivia_ledger_config_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key text NOT NULL, value bigint NOT NULL, previous_value bigint, reason text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(), changed_by text NOT NULL DEFAULT session_user
);
CREATE TABLE IF NOT EXISTS public.trivia_ledger_switches (
  key text PRIMARY KEY CHECK (key IN ('solo_journal')),
  enabled boolean NOT NULL DEFAULT false,
  reason text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.trivia_ledger_switch_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key text NOT NULL, enabled boolean NOT NULL, reason text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(), changed_by text NOT NULL DEFAULT session_user
);
CREATE INDEX IF NOT EXISTS trivia_ledger_switch_history_idx ON public.trivia_ledger_switch_history (key, changed_at);

CREATE OR REPLACE FUNCTION public.trivia_ledger_history_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'trivia ledger: % rows cannot be deleted', TG_TABLE_NAME USING ERRCODE = 'TL002';
  END IF;
  IF TG_TABLE_NAME = 'trivia_ledger_config' THEN
    INSERT INTO public.trivia_ledger_config_history (key, value, previous_value, reason)
    VALUES (NEW.key, NEW.value, CASE WHEN TG_OP = 'UPDATE' THEN OLD.value END, NEW.reason);
  ELSE
    INSERT INTO public.trivia_ledger_switch_history (key, enabled, reason) VALUES (NEW.key, NEW.enabled, NEW.reason);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_trivia_ledger_config_history ON public.trivia_ledger_config;
CREATE TRIGGER trg_trivia_ledger_config_history BEFORE INSERT OR UPDATE OR DELETE ON public.trivia_ledger_config
  FOR EACH ROW EXECUTE FUNCTION public.trivia_ledger_history_guard();
DROP TRIGGER IF EXISTS trg_trivia_ledger_switch_history ON public.trivia_ledger_switches;
CREATE TRIGGER trg_trivia_ledger_switch_history BEFORE INSERT OR UPDATE OR DELETE ON public.trivia_ledger_switches
  FOR EACH ROW EXECUTE FUNCTION public.trivia_ledger_history_guard();

CREATE TABLE IF NOT EXISTS public.trivia_ledger_idempotency_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  idempotency_key text NOT NULL,
  operation text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('replayed', 'conflict')),
  at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS trivia_ledger_idempotency_events_at_idx ON public.trivia_ledger_idempotency_events (at);

CREATE TABLE IF NOT EXISTS public.trivia_ledger_health_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  healthy boolean NOT NULL,
  exception_count integer NOT NULL,
  findings jsonb NOT NULL,
  metrics jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.trivia_ledger_config (key, value, reason) VALUES
  ('treasury_floor', 0, 'Phase 2 provisional default (owner may change)'),
  ('treasury_daily_subsidy_ceiling', 3000, 'Phase 2 provisional default (owner may change)'),
  ('treasury_exposure_ceiling', 3000, 'Phase 2 provisional default (owner may change)'),
  ('treasury_warning_level', 6000, 'Phase 2 provisional default (owner may change)'),
  ('pvp_settlement_slo_seconds', 300, 'Phase 2 provisional default (owner may change)'),
  ('tournament_settlement_slo_seconds', 1800, 'Phase 2 provisional default (owner may change)')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.trivia_ledger_switches (key, enabled, reason)
VALUES ('solo_journal', false, 'Phase 2 install: solo paths stay on the legacy path until root verifies and flips')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- 1b. Rules registry seed (generated from src/lib/trivia/rules/index.mjs)
-- ---------------------------------------------------------------------------------------------
-- BEGIN GENERATED RULES SEED (scripts/trivia/rules-seed-sql.mjs)
INSERT INTO public.trivia_rules_versions (id, rules_key, version, family, mode, provisional, approval_source, rules_canonical, rules_sha256) VALUES
  ('solo.daily@1', 'solo.daily', 1, 'solo', 'daily', false, 'Behavior as deployed on 2026-09-29 (Phase 2 registry seed of live behavior)', '{"clock_zone":"America/Chicago","contract":"trivia-rules/1","daily_bonus":{"amount":10,"funding":"platform_issuance","min_total_questions":10,"once_per":"user_per_chicago_day","reference":"trivia_daily_bonus_<user>_<date>","requires_all_answered":true,"wallet_kind":"trivia_daily_bonus"},"daily_cap":{"day":"America/Chicago","per_mode_per_day":10},"entry":{"arcade_ticket_replaces_cost":false,"cost":0,"funding":"none","reference":null,"revenue_account":null,"survival_continuation":null,"vip_definition":"is_vip and (vip_tier = lifetime or vip_expires_at > now)","vip_plays_free":false,"wallet_kind":null},"family":"solo","lifeline":null,"mode":"daily","payout":{"funding":"platform_issuance","reference":"trivia_session_<session>","wallet_kind":"trivia_run"},"prize_wheel":{"eligibility":{"min_questions":5,"perfect_run":true,"server_verified_score":true,"spins_per_score":1,"window_seconds":1800},"funding":"platform_issuance","item_reference":"trivia_wheel_item_<score>","reference":"trivia_wheel_<score>","segments":[{"base":5,"prize_id":"diamond_5","prize_type":"diamonds","roll_below":30},{"base":10,"prize_id":"diamond_10","prize_type":"diamonds","roll_below":55},{"base":25,"prize_id":"diamond_25","prize_type":"diamonds","roll_below":70},{"base":50,"prize_id":"diamond_50","prize_type":"diamonds","roll_below":80},{"base":100,"prize_id":"diamond_100","prize_type":"diamonds","roll_below":85},{"base":1,"prize_id":"streak_shield","prize_type":"streak_shield","roll_below":93},{"base":1,"prize_id":"free_entry","prize_type":"arcade_ticket","roll_below":98},{"base":15,"prize_id":"mystery","prize_type":"diamonds","roll_below":100}],"streak_multipliers":[{"min_streak":100,"multiplier_bp":500},{"min_streak":30,"multiplier_bp":300},{"min_streak":14,"multiplier_bp":250},{"min_streak":7,"multiplier_bp":200},{"min_streak":0,"multiplier_bp":100}],"wallet_kind":"trivia_prize_wheel"},"questions":{"count":10,"grading":"server","source":"server_roster"},"refund":null,"reward":{"base":5,"formula":"tiered","perfect_bonus":10,"tiers":[{"min_accuracy_bp":10000,"pays":"base_plus_perfect_bonus"},{"min_accuracy_bp":7000,"pays":"base"},{"min_accuracy_bp":5000,"pays":"floor_half_base"},{"min_accuracy_bp":0,"pays":"zero"}]},"scoring":{"accuracy_denominator":"served_roster","points_per_correct":100},"streak_shield":{"protects_missed_days":1},"timer":{"session_deadline_seconds":21600}}', '0ca644066826fd18f022beff6d2b7b187cadfc4d7b44f2a69254280ee0a96665'),
  ('solo.history@1', 'solo.history', 1, 'solo', 'history', false, 'Behavior as deployed on 2026-09-29 (Phase 2 registry seed of live behavior)', '{"clock_zone":"America/Chicago","contract":"trivia-rules/1","daily_bonus":null,"daily_cap":{"day":"America/Chicago","per_mode_per_day":10},"entry":{"arcade_ticket_replaces_cost":false,"cost":0,"funding":"none","reference":null,"revenue_account":null,"survival_continuation":null,"vip_definition":"is_vip and (vip_tier = lifetime or vip_expires_at > now)","vip_plays_free":false,"wallet_kind":null},"family":"solo","lifeline":null,"mode":"history","payout":{"funding":"platform_issuance","reference":"trivia_session_<session>","wallet_kind":"trivia_run"},"prize_wheel":{"eligibility":{"min_questions":5,"perfect_run":true,"server_verified_score":true,"spins_per_score":1,"window_seconds":1800},"funding":"platform_issuance","item_reference":"trivia_wheel_item_<score>","reference":"trivia_wheel_<score>","segments":[{"base":5,"prize_id":"diamond_5","prize_type":"diamonds","roll_below":30},{"base":10,"prize_id":"diamond_10","prize_type":"diamonds","roll_below":55},{"base":25,"prize_id":"diamond_25","prize_type":"diamonds","roll_below":70},{"base":50,"prize_id":"diamond_50","prize_type":"diamonds","roll_below":80},{"base":100,"prize_id":"diamond_100","prize_type":"diamonds","roll_below":85},{"base":1,"prize_id":"streak_shield","prize_type":"streak_shield","roll_below":93},{"base":1,"prize_id":"free_entry","prize_type":"arcade_ticket","roll_below":98},{"base":15,"prize_id":"mystery","prize_type":"diamonds","roll_below":100}],"streak_multipliers":[{"min_streak":100,"multiplier_bp":500},{"min_streak":30,"multiplier_bp":300},{"min_streak":14,"multiplier_bp":250},{"min_streak":7,"multiplier_bp":200},{"min_streak":0,"multiplier_bp":100}],"wallet_kind":"trivia_prize_wheel"},"questions":{"count":20,"grading":"server","source":"server_roster"},"refund":null,"reward":{"base":3,"formula":"tiered","perfect_bonus":5,"tiers":[{"min_accuracy_bp":10000,"pays":"base_plus_perfect_bonus"},{"min_accuracy_bp":7000,"pays":"base"},{"min_accuracy_bp":5000,"pays":"floor_half_base"},{"min_accuracy_bp":0,"pays":"zero"}]},"scoring":{"accuracy_denominator":"served_roster","points_per_correct":100},"streak_shield":{"protects_missed_days":1},"timer":{"session_deadline_seconds":21600}}', '7c03054faacc4493be9292d0c287e100396de707bb677d6d56d1b0e7878b5e7b'),
  ('solo.rules@1', 'solo.rules', 1, 'solo', 'rules', false, 'Behavior as deployed on 2026-09-29 (Phase 2 registry seed of live behavior)', '{"clock_zone":"America/Chicago","contract":"trivia-rules/1","daily_bonus":null,"daily_cap":{"day":"America/Chicago","per_mode_per_day":10},"entry":{"arcade_ticket_replaces_cost":false,"cost":0,"funding":"none","reference":null,"revenue_account":null,"survival_continuation":null,"vip_definition":"is_vip and (vip_tier = lifetime or vip_expires_at > now)","vip_plays_free":false,"wallet_kind":null},"family":"solo","lifeline":null,"mode":"rules","payout":{"funding":"platform_issuance","reference":"trivia_session_<session>","wallet_kind":"trivia_run"},"prize_wheel":{"eligibility":{"min_questions":5,"perfect_run":true,"server_verified_score":true,"spins_per_score":1,"window_seconds":1800},"funding":"platform_issuance","item_reference":"trivia_wheel_item_<score>","reference":"trivia_wheel_<score>","segments":[{"base":5,"prize_id":"diamond_5","prize_type":"diamonds","roll_below":30},{"base":10,"prize_id":"diamond_10","prize_type":"diamonds","roll_below":55},{"base":25,"prize_id":"diamond_25","prize_type":"diamonds","roll_below":70},{"base":50,"prize_id":"diamond_50","prize_type":"diamonds","roll_below":80},{"base":100,"prize_id":"diamond_100","prize_type":"diamonds","roll_below":85},{"base":1,"prize_id":"streak_shield","prize_type":"streak_shield","roll_below":93},{"base":1,"prize_id":"free_entry","prize_type":"arcade_ticket","roll_below":98},{"base":15,"prize_id":"mystery","prize_type":"diamonds","roll_below":100}],"streak_multipliers":[{"min_streak":100,"multiplier_bp":500},{"min_streak":30,"multiplier_bp":300},{"min_streak":14,"multiplier_bp":250},{"min_streak":7,"multiplier_bp":200},{"min_streak":0,"multiplier_bp":100}],"wallet_kind":"trivia_prize_wheel"},"questions":{"count":20,"grading":"server","source":"server_roster"},"refund":null,"reward":{"base":3,"formula":"tiered","perfect_bonus":5,"tiers":[{"min_accuracy_bp":10000,"pays":"base_plus_perfect_bonus"},{"min_accuracy_bp":7000,"pays":"base"},{"min_accuracy_bp":5000,"pays":"floor_half_base"},{"min_accuracy_bp":0,"pays":"zero"}]},"scoring":{"accuracy_denominator":"served_roster","points_per_correct":100},"streak_shield":{"protects_missed_days":1},"timer":{"session_deadline_seconds":21600}}', '962e9bc9bb3163b82a83643f24a359a85f9089c88c0ad14a340bd0cc262ec6d3'),
  ('solo.pro@1', 'solo.pro', 1, 'solo', 'pro', false, 'Behavior as deployed on 2026-09-29 (Phase 2 registry seed of live behavior)', '{"clock_zone":"America/Chicago","contract":"trivia-rules/1","daily_bonus":null,"daily_cap":{"day":"America/Chicago","per_mode_per_day":10},"entry":{"arcade_ticket_replaces_cost":false,"cost":0,"funding":"none","reference":null,"revenue_account":null,"survival_continuation":null,"vip_definition":"is_vip and (vip_tier = lifetime or vip_expires_at > now)","vip_plays_free":false,"wallet_kind":null},"family":"solo","lifeline":null,"mode":"pro","payout":{"funding":"platform_issuance","reference":"trivia_session_<session>","wallet_kind":"trivia_run"},"prize_wheel":{"eligibility":{"min_questions":5,"perfect_run":true,"server_verified_score":true,"spins_per_score":1,"window_seconds":1800},"funding":"platform_issuance","item_reference":"trivia_wheel_item_<score>","reference":"trivia_wheel_<score>","segments":[{"base":5,"prize_id":"diamond_5","prize_type":"diamonds","roll_below":30},{"base":10,"prize_id":"diamond_10","prize_type":"diamonds","roll_below":55},{"base":25,"prize_id":"diamond_25","prize_type":"diamonds","roll_below":70},{"base":50,"prize_id":"diamond_50","prize_type":"diamonds","roll_below":80},{"base":100,"prize_id":"diamond_100","prize_type":"diamonds","roll_below":85},{"base":1,"prize_id":"streak_shield","prize_type":"streak_shield","roll_below":93},{"base":1,"prize_id":"free_entry","prize_type":"arcade_ticket","roll_below":98},{"base":15,"prize_id":"mystery","prize_type":"diamonds","roll_below":100}],"streak_multipliers":[{"min_streak":100,"multiplier_bp":500},{"min_streak":30,"multiplier_bp":300},{"min_streak":14,"multiplier_bp":250},{"min_streak":7,"multiplier_bp":200},{"min_streak":0,"multiplier_bp":100}],"wallet_kind":"trivia_prize_wheel"},"questions":{"count":20,"grading":"server","source":"server_roster"},"refund":null,"reward":{"base":5,"formula":"tiered","perfect_bonus":10,"tiers":[{"min_accuracy_bp":10000,"pays":"base_plus_perfect_bonus"},{"min_accuracy_bp":7000,"pays":"base"},{"min_accuracy_bp":5000,"pays":"floor_half_base"},{"min_accuracy_bp":0,"pays":"zero"}]},"scoring":{"accuracy_denominator":"served_roster","points_per_correct":100},"streak_shield":{"protects_missed_days":1},"timer":{"session_deadline_seconds":21600}}', '9f33788ff3d06cc1122cd55f4ce7a34dae2085504553ffc1d3a2cb8256f24cf0'),
  ('solo.arcade@1', 'solo.arcade', 1, 'solo', 'arcade', false, 'Behavior as deployed on 2026-09-29 (Phase 2 registry seed of live behavior)', '{"clock_zone":"America/Chicago","contract":"trivia-rules/1","daily_bonus":null,"daily_cap":{"day":"America/Chicago","per_mode_per_day":40},"entry":{"arcade_ticket_replaces_cost":true,"cost":10,"funding":"player_wallet","reference":"trivia_entry_<session>","revenue_account":"house:entry:solo","survival_continuation":null,"vip_definition":"is_vip and (vip_tier = lifetime or vip_expires_at > now)","vip_plays_free":true,"wallet_kind":"trivia_entry"},"family":"solo","lifeline":null,"mode":"arcade","payout":{"funding":"platform_issuance","reference":"trivia_session_<session>","wallet_kind":"trivia_run"},"prize_wheel":{"eligibility":{"min_questions":5,"perfect_run":true,"server_verified_score":true,"spins_per_score":1,"window_seconds":1800},"funding":"platform_issuance","item_reference":"trivia_wheel_item_<score>","reference":"trivia_wheel_<score>","segments":[{"base":5,"prize_id":"diamond_5","prize_type":"diamonds","roll_below":30},{"base":10,"prize_id":"diamond_10","prize_type":"diamonds","roll_below":55},{"base":25,"prize_id":"diamond_25","prize_type":"diamonds","roll_below":70},{"base":50,"prize_id":"diamond_50","prize_type":"diamonds","roll_below":80},{"base":100,"prize_id":"diamond_100","prize_type":"diamonds","roll_below":85},{"base":1,"prize_id":"streak_shield","prize_type":"streak_shield","roll_below":93},{"base":1,"prize_id":"free_entry","prize_type":"arcade_ticket","roll_below":98},{"base":15,"prize_id":"mystery","prize_type":"diamonds","roll_below":100}],"streak_multipliers":[{"min_streak":100,"multiplier_bp":500},{"min_streak":30,"multiplier_bp":300},{"min_streak":14,"multiplier_bp":250},{"min_streak":7,"multiplier_bp":200},{"min_streak":0,"multiplier_bp":100}],"wallet_kind":"trivia_prize_wheel"},"questions":{"count":20,"grading":"server","source":"server_roster"},"refund":{"invalid_content":"exact_original_entry","reference":"trivia_entry_refund_<session>","wallet_kind":"refund"},"reward":{"cash_out_min_answered":6,"fallback_without_recorded_sequence":{"base":25,"formula":"arcade_tiered_time_bonus","max_time_bonus":10,"perfect_bonus":15,"tiers":[{"min_accuracy_bp":10000,"pays":"base_plus_perfect_bonus_plus_time_bonus"},{"min_accuracy_bp":9000,"pays":"base_plus_time_bonus"},{"min_accuracy_bp":7000,"pays":"floor_half_base_plus_time_bonus"},{"min_accuracy_bp":5000,"pays":"floor_fifth_base_plus_time_bonus"},{"min_accuracy_bp":0,"pays":"zero"}],"time_bonus_divisor_seconds":6,"time_limit_seconds":180},"formula":"arcade_stakes","max_run_payout":50,"pays_when":"run_complete_or_cash_out","skips_ignored":true,"stake_values":[1,2,3,4,5,6,7,8,9,10],"wrong_answer_resets_pot":true},"scoring":{"accuracy_denominator":"served_roster","points_per_correct":200},"streak_shield":{"protects_missed_days":1},"timer":{"session_deadline_seconds":180}}', 'b7f5fbf458778d07083584c9b20ea032d386deb91d9d6034f4a657195e817d56'),
  ('solo.mtt@1', 'solo.mtt', 1, 'solo', 'mtt', false, 'Behavior as deployed on 2026-09-29 (Phase 2 registry seed of live behavior)', '{"clock_zone":"America/Chicago","contract":"trivia-rules/1","daily_bonus":null,"daily_cap":{"day":"America/Chicago","per_mode_per_day":40},"entry":{"arcade_ticket_replaces_cost":false,"cost":10,"funding":"player_wallet","reference":"trivia_entry_<session>","revenue_account":"house:entry:solo","survival_continuation":null,"vip_definition":"is_vip and (vip_tier = lifetime or vip_expires_at > now)","vip_plays_free":true,"wallet_kind":"trivia_entry"},"family":"solo","lifeline":null,"mode":"mtt","payout":{"funding":"platform_issuance","reference":"trivia_session_<session>","wallet_kind":"trivia_run"},"prize_wheel":{"eligibility":{"min_questions":5,"perfect_run":true,"server_verified_score":true,"spins_per_score":1,"window_seconds":1800},"funding":"platform_issuance","item_reference":"trivia_wheel_item_<score>","reference":"trivia_wheel_<score>","segments":[{"base":5,"prize_id":"diamond_5","prize_type":"diamonds","roll_below":30},{"base":10,"prize_id":"diamond_10","prize_type":"diamonds","roll_below":55},{"base":25,"prize_id":"diamond_25","prize_type":"diamonds","roll_below":70},{"base":50,"prize_id":"diamond_50","prize_type":"diamonds","roll_below":80},{"base":100,"prize_id":"diamond_100","prize_type":"diamonds","roll_below":85},{"base":1,"prize_id":"streak_shield","prize_type":"streak_shield","roll_below":93},{"base":1,"prize_id":"free_entry","prize_type":"arcade_ticket","roll_below":98},{"base":15,"prize_id":"mystery","prize_type":"diamonds","roll_below":100}],"streak_multipliers":[{"min_streak":100,"multiplier_bp":500},{"min_streak":30,"multiplier_bp":300},{"min_streak":14,"multiplier_bp":250},{"min_streak":7,"multiplier_bp":200},{"min_streak":0,"multiplier_bp":100}],"wallet_kind":"trivia_prize_wheel"},"questions":{"count":20,"grading":"server","source":"server_roster"},"refund":{"invalid_content":"exact_original_entry","reference":"trivia_entry_refund_<session>","wallet_kind":"refund"},"reward":{"base":5,"formula":"tiered","perfect_bonus":10,"tiers":[{"min_accuracy_bp":10000,"pays":"base_plus_perfect_bonus"},{"min_accuracy_bp":7000,"pays":"base"},{"min_accuracy_bp":5000,"pays":"floor_half_base"},{"min_accuracy_bp":0,"pays":"zero"}]},"scoring":{"accuracy_denominator":"served_roster","points_per_correct":100},"streak_shield":{"protects_missed_days":1},"timer":{"session_deadline_seconds":21600}}', 'c4137f6ca529d29143597f3fb7a3c2bda8a761b9355bd49f684b16085811c33b'),
  ('solo.cash@1', 'solo.cash', 1, 'solo', 'cash', false, 'Behavior as deployed on 2026-09-29 (Phase 2 registry seed of live behavior)', '{"clock_zone":"America/Chicago","contract":"trivia-rules/1","daily_bonus":null,"daily_cap":{"day":"America/Chicago","per_mode_per_day":40},"entry":{"arcade_ticket_replaces_cost":false,"cost":10,"funding":"player_wallet","reference":"trivia_entry_<session>","revenue_account":"house:entry:solo","survival_continuation":null,"vip_definition":"is_vip and (vip_tier = lifetime or vip_expires_at > now)","vip_plays_free":true,"wallet_kind":"trivia_entry"},"family":"solo","lifeline":null,"mode":"cash","payout":{"funding":"platform_issuance","reference":"trivia_session_<session>","wallet_kind":"trivia_run"},"prize_wheel":{"eligibility":{"min_questions":5,"perfect_run":true,"server_verified_score":true,"spins_per_score":1,"window_seconds":1800},"funding":"platform_issuance","item_reference":"trivia_wheel_item_<score>","reference":"trivia_wheel_<score>","segments":[{"base":5,"prize_id":"diamond_5","prize_type":"diamonds","roll_below":30},{"base":10,"prize_id":"diamond_10","prize_type":"diamonds","roll_below":55},{"base":25,"prize_id":"diamond_25","prize_type":"diamonds","roll_below":70},{"base":50,"prize_id":"diamond_50","prize_type":"diamonds","roll_below":80},{"base":100,"prize_id":"diamond_100","prize_type":"diamonds","roll_below":85},{"base":1,"prize_id":"streak_shield","prize_type":"streak_shield","roll_below":93},{"base":1,"prize_id":"free_entry","prize_type":"arcade_ticket","roll_below":98},{"base":15,"prize_id":"mystery","prize_type":"diamonds","roll_below":100}],"streak_multipliers":[{"min_streak":100,"multiplier_bp":500},{"min_streak":30,"multiplier_bp":300},{"min_streak":14,"multiplier_bp":250},{"min_streak":7,"multiplier_bp":200},{"min_streak":0,"multiplier_bp":100}],"wallet_kind":"trivia_prize_wheel"},"questions":{"count":20,"grading":"server","source":"server_roster"},"refund":{"invalid_content":"exact_original_entry","reference":"trivia_entry_refund_<session>","wallet_kind":"refund"},"reward":{"base":5,"formula":"tiered","perfect_bonus":10,"tiers":[{"min_accuracy_bp":10000,"pays":"base_plus_perfect_bonus"},{"min_accuracy_bp":7000,"pays":"base"},{"min_accuracy_bp":5000,"pays":"floor_half_base"},{"min_accuracy_bp":0,"pays":"zero"}]},"scoring":{"accuracy_denominator":"served_roster","points_per_correct":100},"streak_shield":{"protects_missed_days":1},"timer":{"session_deadline_seconds":21600}}', '133496c80d50a229fa529f077701fe5f5c35834c13a3ea23cc1caa1a438a6e4d'),
  ('solo.icm@1', 'solo.icm', 1, 'solo', 'icm', false, 'Behavior as deployed on 2026-09-29 (Phase 2 registry seed of live behavior)', '{"clock_zone":"America/Chicago","contract":"trivia-rules/1","daily_bonus":null,"daily_cap":{"day":"America/Chicago","per_mode_per_day":40},"entry":{"arcade_ticket_replaces_cost":false,"cost":10,"funding":"player_wallet","reference":"trivia_entry_<session>","revenue_account":"house:entry:solo","survival_continuation":null,"vip_definition":"is_vip and (vip_tier = lifetime or vip_expires_at > now)","vip_plays_free":true,"wallet_kind":"trivia_entry"},"family":"solo","lifeline":null,"mode":"icm","payout":{"funding":"platform_issuance","reference":"trivia_session_<session>","wallet_kind":"trivia_run"},"prize_wheel":{"eligibility":{"min_questions":5,"perfect_run":true,"server_verified_score":true,"spins_per_score":1,"window_seconds":1800},"funding":"platform_issuance","item_reference":"trivia_wheel_item_<score>","reference":"trivia_wheel_<score>","segments":[{"base":5,"prize_id":"diamond_5","prize_type":"diamonds","roll_below":30},{"base":10,"prize_id":"diamond_10","prize_type":"diamonds","roll_below":55},{"base":25,"prize_id":"diamond_25","prize_type":"diamonds","roll_below":70},{"base":50,"prize_id":"diamond_50","prize_type":"diamonds","roll_below":80},{"base":100,"prize_id":"diamond_100","prize_type":"diamonds","roll_below":85},{"base":1,"prize_id":"streak_shield","prize_type":"streak_shield","roll_below":93},{"base":1,"prize_id":"free_entry","prize_type":"arcade_ticket","roll_below":98},{"base":15,"prize_id":"mystery","prize_type":"diamonds","roll_below":100}],"streak_multipliers":[{"min_streak":100,"multiplier_bp":500},{"min_streak":30,"multiplier_bp":300},{"min_streak":14,"multiplier_bp":250},{"min_streak":7,"multiplier_bp":200},{"min_streak":0,"multiplier_bp":100}],"wallet_kind":"trivia_prize_wheel"},"questions":{"count":20,"grading":"server","source":"server_roster"},"refund":{"invalid_content":"exact_original_entry","reference":"trivia_entry_refund_<session>","wallet_kind":"refund"},"reward":{"base":5,"formula":"tiered","perfect_bonus":10,"tiers":[{"min_accuracy_bp":10000,"pays":"base_plus_perfect_bonus"},{"min_accuracy_bp":7000,"pays":"base"},{"min_accuracy_bp":5000,"pays":"floor_half_base"},{"min_accuracy_bp":0,"pays":"zero"}]},"scoring":{"accuracy_denominator":"served_roster","points_per_correct":100},"streak_shield":{"protects_missed_days":1},"timer":{"session_deadline_seconds":21600}}', 'de52c7e69166f7253343b1b599529856bf1513132299e07f34179e541aec25b9'),
  ('solo.gto@1', 'solo.gto', 1, 'solo', 'gto', false, 'Behavior as deployed on 2026-09-29 (Phase 2 registry seed of live behavior)', '{"clock_zone":"America/Chicago","contract":"trivia-rules/1","daily_bonus":null,"daily_cap":{"day":"America/Chicago","per_mode_per_day":60},"entry":{"arcade_ticket_replaces_cost":false,"cost":10,"funding":"player_wallet","reference":"trivia_entry_<session>","revenue_account":"house:entry:solo","survival_continuation":null,"vip_definition":"is_vip and (vip_tier = lifetime or vip_expires_at > now)","vip_plays_free":true,"wallet_kind":"trivia_entry"},"family":"solo","lifeline":null,"mode":"gto","payout":{"funding":"platform_issuance","reference":"trivia_session_<session>","wallet_kind":"trivia_run"},"prize_wheel":{"eligibility":{"min_questions":5,"perfect_run":true,"server_verified_score":true,"spins_per_score":1,"window_seconds":1800},"funding":"platform_issuance","item_reference":"trivia_wheel_item_<score>","reference":"trivia_wheel_<score>","segments":[{"base":5,"prize_id":"diamond_5","prize_type":"diamonds","roll_below":30},{"base":10,"prize_id":"diamond_10","prize_type":"diamonds","roll_below":55},{"base":25,"prize_id":"diamond_25","prize_type":"diamonds","roll_below":70},{"base":50,"prize_id":"diamond_50","prize_type":"diamonds","roll_below":80},{"base":100,"prize_id":"diamond_100","prize_type":"diamonds","roll_below":85},{"base":1,"prize_id":"streak_shield","prize_type":"streak_shield","roll_below":93},{"base":1,"prize_id":"free_entry","prize_type":"arcade_ticket","roll_below":98},{"base":15,"prize_id":"mystery","prize_type":"diamonds","roll_below":100}],"streak_multipliers":[{"min_streak":100,"multiplier_bp":500},{"min_streak":30,"multiplier_bp":300},{"min_streak":14,"multiplier_bp":250},{"min_streak":7,"multiplier_bp":200},{"min_streak":0,"multiplier_bp":100}],"wallet_kind":"trivia_prize_wheel"},"questions":{"count":20,"grading":"server","source":"server_roster"},"refund":{"invalid_content":"exact_original_entry","reference":"trivia_entry_refund_<session>","wallet_kind":"refund"},"reward":{"base":8,"formula":"tiered","perfect_bonus":15,"tiers":[{"min_accuracy_bp":10000,"pays":"base_plus_perfect_bonus"},{"min_accuracy_bp":7000,"pays":"base"},{"min_accuracy_bp":5000,"pays":"floor_half_base"},{"min_accuracy_bp":0,"pays":"zero"}]},"scoring":{"accuracy_denominator":"served_roster","points_per_correct":150},"streak_shield":{"protects_missed_days":1},"timer":{"session_deadline_seconds":21600}}', '8b50041225bd80c2886b01a1ecf2f01cf2ed1ddc506139611249f869ff349ece'),
  ('solo.mixed@1', 'solo.mixed', 1, 'solo', 'mixed', false, 'Behavior as deployed on 2026-09-29 (Phase 2 registry seed of live behavior)', '{"clock_zone":"America/Chicago","contract":"trivia-rules/1","daily_bonus":null,"daily_cap":{"day":"America/Chicago","per_mode_per_day":40},"entry":{"arcade_ticket_replaces_cost":false,"cost":10,"funding":"player_wallet","reference":"trivia_entry_<session>","revenue_account":"house:entry:solo","survival_continuation":null,"vip_definition":"is_vip and (vip_tier = lifetime or vip_expires_at > now)","vip_plays_free":true,"wallet_kind":"trivia_entry"},"family":"solo","lifeline":null,"mode":"mixed","payout":{"funding":"platform_issuance","reference":"trivia_session_<session>","wallet_kind":"trivia_run"},"prize_wheel":{"eligibility":{"min_questions":5,"perfect_run":true,"server_verified_score":true,"spins_per_score":1,"window_seconds":1800},"funding":"platform_issuance","item_reference":"trivia_wheel_item_<score>","reference":"trivia_wheel_<score>","segments":[{"base":5,"prize_id":"diamond_5","prize_type":"diamonds","roll_below":30},{"base":10,"prize_id":"diamond_10","prize_type":"diamonds","roll_below":55},{"base":25,"prize_id":"diamond_25","prize_type":"diamonds","roll_below":70},{"base":50,"prize_id":"diamond_50","prize_type":"diamonds","roll_below":80},{"base":100,"prize_id":"diamond_100","prize_type":"diamonds","roll_below":85},{"base":1,"prize_id":"streak_shield","prize_type":"streak_shield","roll_below":93},{"base":1,"prize_id":"free_entry","prize_type":"arcade_ticket","roll_below":98},{"base":15,"prize_id":"mystery","prize_type":"diamonds","roll_below":100}],"streak_multipliers":[{"min_streak":100,"multiplier_bp":500},{"min_streak":30,"multiplier_bp":300},{"min_streak":14,"multiplier_bp":250},{"min_streak":7,"multiplier_bp":200},{"min_streak":0,"multiplier_bp":100}],"wallet_kind":"trivia_prize_wheel"},"questions":{"count":21,"grading":"server","source":"server_roster"},"refund":{"invalid_content":"exact_original_entry","reference":"trivia_entry_refund_<session>","wallet_kind":"refund"},"reward":{"base":5,"formula":"tiered","perfect_bonus":10,"tiers":[{"min_accuracy_bp":10000,"pays":"base_plus_perfect_bonus"},{"min_accuracy_bp":7000,"pays":"base"},{"min_accuracy_bp":5000,"pays":"floor_half_base"},{"min_accuracy_bp":0,"pays":"zero"}]},"scoring":{"accuracy_denominator":"served_roster","points_per_correct":100},"streak_shield":{"protects_missed_days":1},"timer":{"session_deadline_seconds":21600}}', '1409189eb7624a269c47c15b9613e3d1efaff68d0def5bbb6b661ebf4bcfccbe'),
  ('solo.endless@1', 'solo.endless', 1, 'solo', 'endless', false, 'Behavior as deployed on 2026-09-29 (Phase 2 registry seed of live behavior)', '{"clock_zone":"America/Chicago","contract":"trivia-rules/1","daily_bonus":null,"daily_cap":{"day":"America/Chicago","per_mode_per_day":40},"entry":{"arcade_ticket_replaces_cost":false,"cost":10,"funding":"player_wallet","reference":"trivia_entry_<session>","revenue_account":"house:entry:solo","survival_continuation":null,"vip_definition":"is_vip and (vip_tier = lifetime or vip_expires_at > now)","vip_plays_free":true,"wallet_kind":"trivia_entry"},"family":"solo","lifeline":{"reference":"spend:<user>:trivia_lifeline:<session>:<question>:skip","revenue_account":"house:spend:lifeline","skip_cost":5,"wallet_kind":"trivia_lifeline"},"mode":"endless","payout":{"funding":"platform_issuance","reference":"trivia_session_<session>","wallet_kind":"trivia_run"},"prize_wheel":{"eligibility":{"min_questions":5,"perfect_run":true,"server_verified_score":true,"spins_per_score":1,"window_seconds":1800},"funding":"platform_issuance","item_reference":"trivia_wheel_item_<score>","reference":"trivia_wheel_<score>","segments":[{"base":5,"prize_id":"diamond_5","prize_type":"diamonds","roll_below":30},{"base":10,"prize_id":"diamond_10","prize_type":"diamonds","roll_below":55},{"base":25,"prize_id":"diamond_25","prize_type":"diamonds","roll_below":70},{"base":50,"prize_id":"diamond_50","prize_type":"diamonds","roll_below":80},{"base":100,"prize_id":"diamond_100","prize_type":"diamonds","roll_below":85},{"base":1,"prize_id":"streak_shield","prize_type":"streak_shield","roll_below":93},{"base":1,"prize_id":"free_entry","prize_type":"arcade_ticket","roll_below":98},{"base":15,"prize_id":"mystery","prize_type":"diamonds","roll_below":100}],"streak_multipliers":[{"min_streak":100,"multiplier_bp":500},{"min_streak":30,"multiplier_bp":300},{"min_streak":14,"multiplier_bp":250},{"min_streak":7,"multiplier_bp":200},{"min_streak":0,"multiplier_bp":100}],"wallet_kind":"trivia_prize_wheel"},"questions":{"count":100,"grading":"server","source":"server_roster"},"refund":{"invalid_content":"exact_original_entry","reference":"trivia_entry_refund_<session>","wallet_kind":"refund"},"reward":{"formula":"per_correct","per_correct":1},"scoring":{"accuracy_denominator":"served_roster","points_per_correct":200},"streak_shield":{"protects_missed_days":1},"timer":{"session_deadline_seconds":21600}}', '5be7a2c70f594e282a1e605936d6c6f91f9d46b95a053438d0b100728ee90f90'),
  ('solo.survival@1', 'solo.survival', 1, 'solo', 'survival', false, 'Behavior as deployed on 2026-09-29 (Phase 2 registry seed of live behavior)', '{"clock_zone":"America/Chicago","contract":"trivia-rules/1","daily_bonus":null,"daily_cap":{"day":"America/Chicago","per_mode_per_day":80},"entry":{"arcade_ticket_replaces_cost":false,"cost":10,"funding":"player_wallet","reference":"trivia_entry_<session>","revenue_account":"house:entry:solo","survival_continuation":{"cost":0,"max_level":10,"parent_window_seconds":21600,"required_correct_by_level":[17,18,18,19,19,19,20,20,20,20]},"vip_definition":"is_vip and (vip_tier = lifetime or vip_expires_at > now)","vip_plays_free":true,"wallet_kind":"trivia_entry"},"family":"solo","lifeline":{"reference":"spend:<user>:trivia_lifeline:<session>:<question>:skip","revenue_account":"house:spend:lifeline","skip_cost":5,"wallet_kind":"trivia_lifeline"},"mode":"survival","payout":{"funding":"platform_issuance","reference":"trivia_session_<session>","wallet_kind":"trivia_run"},"prize_wheel":{"eligibility":{"min_questions":5,"perfect_run":true,"server_verified_score":true,"spins_per_score":1,"window_seconds":1800},"funding":"platform_issuance","item_reference":"trivia_wheel_item_<score>","reference":"trivia_wheel_<score>","segments":[{"base":5,"prize_id":"diamond_5","prize_type":"diamonds","roll_below":30},{"base":10,"prize_id":"diamond_10","prize_type":"diamonds","roll_below":55},{"base":25,"prize_id":"diamond_25","prize_type":"diamonds","roll_below":70},{"base":50,"prize_id":"diamond_50","prize_type":"diamonds","roll_below":80},{"base":100,"prize_id":"diamond_100","prize_type":"diamonds","roll_below":85},{"base":1,"prize_id":"streak_shield","prize_type":"streak_shield","roll_below":93},{"base":1,"prize_id":"free_entry","prize_type":"arcade_ticket","roll_below":98},{"base":15,"prize_id":"mystery","prize_type":"diamonds","roll_below":100}],"streak_multipliers":[{"min_streak":100,"multiplier_bp":500},{"min_streak":30,"multiplier_bp":300},{"min_streak":14,"multiplier_bp":250},{"min_streak":7,"multiplier_bp":200},{"min_streak":0,"multiplier_bp":100}],"wallet_kind":"trivia_prize_wheel"},"questions":{"count":20,"grading":"server","source":"server_roster"},"refund":{"invalid_content":"exact_original_entry","reference":"trivia_entry_refund_<session>","wallet_kind":"refund"},"reward":{"formula":"survival_escalating","max_multiplier":3,"max_run_payout":60,"step":5},"scoring":{"accuracy_denominator":"served_roster","points_per_correct":200},"streak_shield":{"protects_missed_days":1},"timer":{"session_deadline_seconds":21600}}', 'e56151c1e9004980a2619eccf14ca86483db84dbee1c172812f2d115b8a5cb7b'),
  ('solo.time-attack@1', 'solo.time-attack', 1, 'solo', 'time-attack', false, 'Behavior as deployed on 2026-09-29 (Phase 2 registry seed of live behavior)', '{"clock_zone":"America/Chicago","contract":"trivia-rules/1","daily_bonus":null,"daily_cap":{"day":"America/Chicago","per_mode_per_day":40},"entry":{"arcade_ticket_replaces_cost":false,"cost":10,"funding":"player_wallet","reference":"trivia_entry_<session>","revenue_account":"house:entry:solo","survival_continuation":null,"vip_definition":"is_vip and (vip_tier = lifetime or vip_expires_at > now)","vip_plays_free":true,"wallet_kind":"trivia_entry"},"family":"solo","lifeline":null,"mode":"time-attack","payout":{"funding":"platform_issuance","reference":"trivia_session_<session>","wallet_kind":"trivia_run"},"prize_wheel":{"eligibility":{"min_questions":5,"perfect_run":true,"server_verified_score":true,"spins_per_score":1,"window_seconds":1800},"funding":"platform_issuance","item_reference":"trivia_wheel_item_<score>","reference":"trivia_wheel_<score>","segments":[{"base":5,"prize_id":"diamond_5","prize_type":"diamonds","roll_below":30},{"base":10,"prize_id":"diamond_10","prize_type":"diamonds","roll_below":55},{"base":25,"prize_id":"diamond_25","prize_type":"diamonds","roll_below":70},{"base":50,"prize_id":"diamond_50","prize_type":"diamonds","roll_below":80},{"base":100,"prize_id":"diamond_100","prize_type":"diamonds","roll_below":85},{"base":1,"prize_id":"streak_shield","prize_type":"streak_shield","roll_below":93},{"base":1,"prize_id":"free_entry","prize_type":"arcade_ticket","roll_below":98},{"base":15,"prize_id":"mystery","prize_type":"diamonds","roll_below":100}],"streak_multipliers":[{"min_streak":100,"multiplier_bp":500},{"min_streak":30,"multiplier_bp":300},{"min_streak":14,"multiplier_bp":250},{"min_streak":7,"multiplier_bp":200},{"min_streak":0,"multiplier_bp":100}],"wallet_kind":"trivia_prize_wheel"},"questions":{"count":60,"grading":"server","source":"server_roster"},"refund":{"invalid_content":"exact_original_entry","reference":"trivia_entry_refund_<session>","wallet_kind":"refund"},"reward":{"formula":"per_correct","per_correct":1},"scoring":{"accuracy_denominator":"served_roster","points_per_correct":200},"streak_shield":{"protects_missed_days":1},"timer":{"session_deadline_seconds":30}}', 'd4b695a9519984ea2d8791b4e81d8d00f1e0b9951b6619b16c211f0953810fe0'),
  ('pvp.standard@1', 'pvp.standard', 1, 'pvp', 'pvp', false, 'docs/trivia/TRIVIA-COMPETITIVE-CONTRACT-V1.md (product owner, containment contract 2026-09-06)', '{"clock_zone":"America/Chicago","contract":"trivia-rules/1","family":"pvp","horse":{"disclosure":"Smarter Horse","fallback_wait_seconds":{"max":45,"min":20},"human_first":true,"max_horses_per_match":1,"seat_funding":"treasury","wait_persisted_once":true,"winnings_to":"treasury"},"match_window_seconds":1800,"mode":"pvp","outcomes":{"forfeit":"finisher_wins_under_winner_rule_when_opponent_was_charged","half_funded":"refund_only_the_charged_finisher","incomplete":"refund_each_charged_stake","tie":"refund_each_charged_stake","void":"zero_movement_when_nobody_was_charged","win":"winner_receives_pot_minus_rake"},"questions":{"count":20,"grading":"server","source":"server_roster","unique":true},"rake":{"basis":"funded_pot","denominator":100,"numerator":10,"rounding":"floor"},"references":{"refund":"pvp_refund_<match>_<user>","settlement":"pvp_settlement_<match>","stake":"pvp_stake_<match>_<user>","tie_refund":"pvp_tie_refund_<match>_<user>","win":"pvp_match_win_<match>"},"scoring":{"metric":"correct_count","tie":"equal_correct_count"},"stakes":[10,25,50,100],"wallet_kinds":{"refund":"pvp_refund","stake":"pvp_stake","win":"pvp_win"}}', 'febf136d436f404b734fe0de89ea02047909e23942ae03b35fb204731573144f'),
  ('tournament.nightly@1', 'tournament.nightly', 1, 'tournament', 'tournaments', true, 'PROVISIONAL - chosen by Phase 2 (conservative); pending product-owner approval', '{"byes":"top_seeds_receive_byes","cancellation":{"horse_entries_return_to":"treasury","human_reference":"trivia_tourn_cancel_<tournament>_<user>","human_wallet_kind":"tournament_cancel_refund","refunds":"every_stored_entry_exactly","when":["fewer_than_min_horses_at_final_reconciliation","failure_before_round_one"]},"clock_zone":"America/Chicago","contract":"trivia-rules/1","disconnect":"unanswered_questions_score_zero_with_max_time","entry":{"fee":10,"horse_funding":"treasury","human_funding":"player_wallet","reference":"trivia_tourn_entry_<tournament>_<user>","vip_discount":false,"vip_required":false,"wallet_kind":"tournament_entry"},"family":"tournament","field":{"bracket_size":256,"entries_per_player":1,"expandable_to":512,"format":"single_elimination","horse_target":{"max":140,"min":70,"sampled_once":true},"human_capacity":"bracket_size_minus_horse_target","min_horses_to_run":70},"match":{"identical_question_revisions_per_match":true,"per_user_option_permutations":true,"questions":10,"round_window_seconds":300,"shot_clock_seconds":20,"transition_seconds":{"max":90,"min":60}},"mode":"tournaments","no_show":{"both_seats":"better_seed_advances","refund_after_registration_close":false,"scores":"zero_correct_max_time"},"overlay":{"treasury_guarantee":0},"prizes":{"basis":"final_prize_pool","horse_prizes_to":"treasury","reference":"trivia_tourn_payout_<tournament>_<user>","split":"tier_amount_floor_divided_equally_remainder_to_champion","tiers":[{"bp":3200,"finish_tier":1,"places":1},{"bp":2000,"finish_tier":2,"places":1},{"bp":2300,"finish_tier":3,"places":2},{"bp":2500,"finish_tier":5,"places":4}],"wallet_kind":"tournament_prize"},"provisional_note":"Economics chosen conservatively by Phase 2; owner may change them with a new version.","rake":{"on_refunds":0,"per_settled_entry":{"minimum":1,"rate_bp":1000,"rounding":"round"},"taken":"at_settlement"},"references":{"settlement":"trivia_tourn_settlement_<tournament>"},"schedule":{"instances_per_local_date":1,"local_start":"20:00","registration_closes":"at_start"},"ties":["more_correct","lower_total_answer_ms","earlier_completion","better_seed"]}', '21af11425b85ffd408e211ddaf7011885bcb9a7e2467e07a776e75ef6310b020')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.trivia_rules_current (rules_key, rules_version_id, reason) VALUES
  ('solo.daily', 'solo.daily@1', 'Phase 2 registry seed'),
  ('solo.history', 'solo.history@1', 'Phase 2 registry seed'),
  ('solo.rules', 'solo.rules@1', 'Phase 2 registry seed'),
  ('solo.pro', 'solo.pro@1', 'Phase 2 registry seed'),
  ('solo.arcade', 'solo.arcade@1', 'Phase 2 registry seed'),
  ('solo.mtt', 'solo.mtt@1', 'Phase 2 registry seed'),
  ('solo.cash', 'solo.cash@1', 'Phase 2 registry seed'),
  ('solo.icm', 'solo.icm@1', 'Phase 2 registry seed'),
  ('solo.gto', 'solo.gto@1', 'Phase 2 registry seed'),
  ('solo.mixed', 'solo.mixed@1', 'Phase 2 registry seed'),
  ('solo.endless', 'solo.endless@1', 'Phase 2 registry seed'),
  ('solo.survival', 'solo.survival@1', 'Phase 2 registry seed'),
  ('solo.time-attack', 'solo.time-attack@1', 'Phase 2 registry seed'),
  ('pvp.standard', 'pvp.standard@1', 'Phase 2 registry seed'),
  ('tournament.nightly', 'tournament.nightly@1', 'Phase 2 registry seed')
ON CONFLICT (rules_key) DO NOTHING;
-- END GENERATED RULES SEED


-- ---------------------------------------------------------------------------------------------
-- 5. Immutability, writer gate and the balanced-journal constraint
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_ledger_writer_active()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $fn$
  SELECT COALESCE(current_setting('trivia_ledger.writer', true), '') = 'on';
$fn$;

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['trivia_ledger_journals', 'trivia_ledger_lines', 'trivia_settlement_events',
                           'trivia_ledger_idempotency_events', 'trivia_ledger_health_runs',
                           'trivia_ledger_config_history', 'trivia_ledger_switch_history'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_immutable ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_immutable BEFORE UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.trivia_ledger_refuse_mutation()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_no_truncate ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_no_truncate BEFORE TRUNCATE ON public.%1$I FOR EACH STATEMENT EXECUTE FUNCTION public.trivia_ledger_refuse_mutation()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['trivia_ledger_accounts', 'trivia_settlements', 'trivia_settlement_participants',
                           'trivia_ledger_config', 'trivia_ledger_switches', 'trivia_rules_current'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_no_truncate ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_no_truncate BEFORE TRUNCATE ON public.%1$I FOR EACH STATEMENT EXECUTE FUNCTION public.trivia_ledger_refuse_mutation()', t);
  END LOOP;
END $do$;

-- Journal and line inserts, account balance changes and settlement/participant changes are
-- only accepted from inside the ledger's own functions.
CREATE OR REPLACE FUNCTION public.trivia_ledger_write_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
DECLARE v_declared integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'trivia ledger: % rows cannot be deleted', TG_TABLE_NAME USING ERRCODE = 'TL002';
  END IF;
  IF NOT public.trivia_ledger_writer_active() THEN
    RAISE EXCEPTION 'trivia ledger: % on % is only accepted from the ledger functions', TG_OP, TG_TABLE_NAME USING ERRCODE = 'TL002';
  END IF;
  IF TG_TABLE_NAME = 'trivia_ledger_lines' THEN
    IF NEW.journal_id::text IS DISTINCT FROM current_setting('trivia_ledger.open_journal', true) THEN
      RAISE EXCEPTION 'trivia ledger: lines may only be added to the journal being posted' USING ERRCODE = 'TL002';
    END IF;
    SELECT line_count INTO v_declared FROM public.trivia_ledger_journals WHERE id = NEW.journal_id;
    IF v_declared IS NULL OR NEW.line_no > v_declared THEN
      RAISE EXCEPTION 'trivia ledger: line % exceeds the declared line count of journal %', NEW.line_no, NEW.journal_id USING ERRCODE = 'TL002';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'trivia_ledger_accounts' AND TG_OP = 'UPDATE' THEN
    IF NEW.account_code IS DISTINCT FROM OLD.account_code OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
       OR NEW.tracks_balance IS DISTINCT FROM OLD.tracks_balance OR NEW.min_balance IS DISTINCT FROM OLD.min_balance
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR (OLD.state = 'closed' AND (NEW.state <> 'closed' OR NEW.balance <> OLD.balance
                                     OR NEW.closed_at IS DISTINCT FROM OLD.closed_at)) THEN
      RAISE EXCEPTION 'trivia ledger: account % identity is immutable and a closed account stays closed', OLD.account_code USING ERRCODE = 'TL002';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'trivia_settlements' AND TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.subject_type IS DISTINCT FROM OLD.subject_type
       OR NEW.subject_id IS DISTINCT FROM OLD.subject_id OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.rules_version_id IS DISTINCT FROM OLD.rules_version_id
       OR NEW.escrow_account_code IS DISTINCT FROM OLD.escrow_account_code OR NEW.opened_at IS DISTINCT FROM OLD.opened_at
       OR (OLD.gross_pool IS NOT NULL AND NEW.gross_pool IS DISTINCT FROM OLD.gross_pool)
       OR (OLD.locked_at IS NOT NULL AND NEW.locked_at IS DISTINCT FROM OLD.locked_at)
       OR OLD.state IN ('settled', 'refunded', 'voided')
       OR NOT ((OLD.state = NEW.state)
               OR (OLD.state = 'open' AND NEW.state IN ('locked', 'refunded', 'voided'))
               OR (OLD.state = 'locked' AND NEW.state IN ('settled', 'refunded', 'voided')))
       OR (OLD.state <> 'open' AND (NEW.held_total <> OLD.held_total OR NEW.subsidy_total <> OLD.subsidy_total
                                    OR NEW.released_total <> OLD.released_total)) THEN
      RAISE EXCEPTION 'trivia ledger: settlement % transition %->% or field change refused', OLD.id, OLD.state, NEW.state USING ERRCODE = 'TL002';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'trivia_settlement_participants' AND TG_OP = 'UPDATE' THEN
    IF NEW.settlement_id IS DISTINCT FROM OLD.settlement_id OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.participant_kind IS DISTINCT FROM OLD.participant_kind OR NEW.funding_source IS DISTINCT FROM OLD.funding_source
       OR NEW.entry_amount IS DISTINCT FROM OLD.entry_amount OR NEW.hold_journal_id IS DISTINCT FROM OLD.hold_journal_id
       OR NEW.hold_reference IS DISTINCT FROM OLD.hold_reference OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR OLD.state <> 'held' THEN
      RAISE EXCEPTION 'trivia ledger: participant % in settlement % is final or its entry is immutable', OLD.user_id, OLD.settlement_id USING ERRCODE = 'TL002';
    END IF;
    NEW.updated_at := clock_timestamp();
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_trivia_ledger_journals_write_guard ON public.trivia_ledger_journals;
CREATE TRIGGER trg_trivia_ledger_journals_write_guard BEFORE INSERT ON public.trivia_ledger_journals
  FOR EACH ROW EXECUTE FUNCTION public.trivia_ledger_write_guard();
DROP TRIGGER IF EXISTS trg_trivia_ledger_lines_write_guard ON public.trivia_ledger_lines;
CREATE TRIGGER trg_trivia_ledger_lines_write_guard BEFORE INSERT ON public.trivia_ledger_lines
  FOR EACH ROW EXECUTE FUNCTION public.trivia_ledger_write_guard();
DROP TRIGGER IF EXISTS trg_trivia_ledger_accounts_write_guard ON public.trivia_ledger_accounts;
CREATE TRIGGER trg_trivia_ledger_accounts_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.trivia_ledger_accounts
  FOR EACH ROW EXECUTE FUNCTION public.trivia_ledger_write_guard();
DROP TRIGGER IF EXISTS trg_trivia_settlements_write_guard ON public.trivia_settlements;
CREATE TRIGGER trg_trivia_settlements_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.trivia_settlements
  FOR EACH ROW EXECUTE FUNCTION public.trivia_ledger_write_guard();
DROP TRIGGER IF EXISTS trg_trivia_settlement_participants_write_guard ON public.trivia_settlement_participants;
CREATE TRIGGER trg_trivia_settlement_participants_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.trivia_settlement_participants
  FOR EACH ROW EXECUTE FUNCTION public.trivia_ledger_write_guard();
DROP TRIGGER IF EXISTS trg_trivia_settlement_events_write_guard ON public.trivia_settlement_events;
CREATE TRIGGER trg_trivia_settlement_events_write_guard BEFORE INSERT ON public.trivia_settlement_events
  FOR EACH ROW EXECUTE FUNCTION public.trivia_ledger_write_guard();

-- Every journal balances to zero, has at least two lines and exactly its declared line count.
-- Deferred to COMMIT: an unbalanced journal can never become visible, whatever wrote it.
CREATE OR REPLACE FUNCTION public.trivia_ledger_assert_balanced()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
DECLARE v_journal uuid; v_sum numeric; v_n integer; v_declared integer; v_debit bigint; v_credit bigint;
BEGIN
  IF TG_TABLE_NAME = 'trivia_ledger_journals' THEN
    v_journal := NEW.id;
  ELSE
    v_journal := NEW.journal_id;
  END IF;
  SELECT COALESCE(sum(l.amount), 0), count(*),
         COALESCE(sum(-l.amount) FILTER (WHERE l.amount < 0), 0), COALESCE(sum(l.amount) FILTER (WHERE l.amount > 0), 0)
    INTO v_sum, v_n, v_debit, v_credit
    FROM public.trivia_ledger_lines l WHERE l.journal_id = v_journal;
  SELECT j.line_count INTO v_declared FROM public.trivia_ledger_journals j
   WHERE j.id = v_journal AND j.total_debit = v_debit AND j.total_credit = v_credit;
  IF v_sum <> 0 OR v_n < 2 OR v_declared IS NULL OR v_n <> v_declared THEN
    RAISE EXCEPTION 'trivia ledger: journal % does not balance (sum %, lines %, declared %)', v_journal, v_sum, v_n, v_declared
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS trg_trivia_ledger_journals_balanced ON public.trivia_ledger_journals;
CREATE CONSTRAINT TRIGGER trg_trivia_ledger_journals_balanced AFTER INSERT ON public.trivia_ledger_journals
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.trivia_ledger_assert_balanced();
DROP TRIGGER IF EXISTS trg_trivia_ledger_lines_balanced ON public.trivia_ledger_lines;
CREATE CONSTRAINT TRIGGER trg_trivia_ledger_lines_balanced AFTER INSERT ON public.trivia_ledger_lines
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.line_no = 1) EXECUTE FUNCTION public.trivia_ledger_assert_balanced();

-- ---------------------------------------------------------------------------------------------
-- 6. Core: accounts, idempotency, platform wallet moves, posting
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_ledger_ensure_account(p_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  c_uuid constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  v_kind text; v_user uuid; v_subject uuid; v_tracks boolean := true; v_min bigint := 0;
BEGIN
  IF p_code ~ ('^wallet:' || c_uuid || '$') THEN
    v_kind := 'player_wallet'; v_user := substr(p_code, 8)::uuid; v_tracks := false; v_min := NULL;
  ELSIF p_code = 'treasury:trivia' THEN
    v_kind := 'treasury';
  ELSIF p_code ~ ('^escrow:pvp:' || c_uuid || '$') THEN
    v_kind := 'pvp_escrow'; v_subject := substr(p_code, 12)::uuid;
  ELSIF p_code ~ ('^escrow:tournament:' || c_uuid || '$') THEN
    v_kind := 'tournament_escrow'; v_subject := substr(p_code, 19)::uuid;
  ELSIF p_code IN ('house:rake:pvp', 'house:rake:tournament', 'house:entry:solo', 'house:spend:lifeline') THEN
    v_kind := 'house_revenue';
  ELSIF p_code ~ ('^liability:refund:' || c_uuid || '$') THEN
    v_kind := 'refund_liability'; v_user := substr(p_code, 18)::uuid;
  ELSIF p_code IN ('issuance:trivia_run', 'issuance:trivia_daily_bonus', 'issuance:trivia_prize_wheel', 'issuance:treasury_funding') THEN
    v_kind := 'platform_issuance'; v_min := NULL;
  ELSIF p_code = 'suspense:legacy' THEN
    v_kind := 'legacy_suspense'; v_min := NULL;
  ELSE
    PERFORM public.trivia_ledger_raise('invalid_account', jsonb_build_object('account', p_code));
  END IF;
  PERFORM set_config('trivia_ledger.writer', 'on', true);
  INSERT INTO public.trivia_ledger_accounts (account_code, kind, user_id, subject_id, tracks_balance, min_balance)
  VALUES (p_code, v_kind, v_user, v_subject, v_tracks, v_min)
  ON CONFLICT (account_code) DO NOTHING;
  RETURN v_kind;
END $fn$;

CREATE OR REPLACE FUNCTION public.trivia_ledger_error(p_code text, p_detail text, p_key text, p_operation text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $fn$
DECLARE v_detail jsonb;
BEGIN
  BEGIN
    v_detail := CASE WHEN COALESCE(btrim(p_detail), '') = '' THEN '{}'::jsonb ELSE p_detail::jsonb END;
  EXCEPTION WHEN OTHERS THEN
    v_detail := jsonb_build_object('message', p_detail);
  END;
  RETURN jsonb_build_object('success', false, 'replayed', false, 'error', p_code, 'detail', v_detail,
                            'idempotency_key', p_key, 'operation', p_operation);
END $fn$;

CREATE OR REPLACE FUNCTION public.trivia_ledger_unexpected(p_sqlstate text, p_message text, p_key text, p_operation text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $fn$
  SELECT jsonb_build_object('success', false, 'replayed', false,
    'error', CASE WHEN p_sqlstate IN ('40P01', '40001', '55P03') THEN 'retryable_conflict'
                  WHEN p_sqlstate LIKE 'P04%' OR p_sqlstate = '23514' THEN 'wallet_refused'
                  ELSE 'internal_error' END,
    'sqlstate', p_sqlstate, 'message', left(p_message, 500), 'idempotency_key', p_key, 'operation', p_operation);
$fn$;

-- Serializes a key, and returns NULL for a new request, the ORIGINAL result for an exact
-- replay, or an idempotency_conflict for the same key with a different request.
CREATE OR REPLACE FUNCTION public.trivia_ledger_begin(p_key text, p_operation text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_hash text; j public.trivia_ledger_journals%ROWTYPE;
BEGIN
  IF p_key IS NULL OR p_key !~ '^[A-Za-z0-9_:.@-]{8,200}$' THEN
    PERFORM public.trivia_ledger_raise('invalid_idempotency_key', jsonb_build_object('idempotency_key', p_key));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('trivia_ledger:' || p_key, 20260929));
  v_hash := public.trivia_ledger_sha256(p_request::text);
  SELECT * INTO j FROM public.trivia_ledger_journals WHERE idempotency_key = p_key;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF j.request_hash = v_hash AND j.operation = p_operation THEN
    INSERT INTO public.trivia_ledger_idempotency_events (idempotency_key, operation, outcome) VALUES (p_key, p_operation, 'replayed');
    RETURN j.result || jsonb_build_object('replayed', true, 'journal_seq', j.journal_seq);
  END IF;
  INSERT INTO public.trivia_ledger_idempotency_events (idempotency_key, operation, outcome) VALUES (p_key, p_operation, 'conflict');
  RETURN jsonb_build_object('success', false, 'replayed', false, 'error', 'idempotency_conflict',
                            'idempotency_key', p_key, 'operation', p_operation, 'journal_id', j.id);
END $fn$;

-- The ONLY place trivia money touches a balance: the platform's own sanctioned functions, then a
-- read-back of the exact diamond_transactions row they wrote (same reference, amount and kind).
CREATE OR REPLACE FUNCTION public.trivia_ledger_platform_move(p_mechanism text, p_user uuid, p_amount bigint,
  p_kind text, p_description text, p_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE r jsonb; v_row record; v_err text; v_detail jsonb;
BEGIN
  v_detail := jsonb_build_object('user_id', p_user, 'amount', p_amount, 'wallet_kind', p_kind, 'reference', p_reference);
  IF p_user IS NULL OR p_amount IS NULL OR p_amount = 0 OR abs(p_amount) > 2000000000 OR p_reference IS NULL THEN
    PERFORM public.trivia_ledger_raise('invalid_wallet_leg', v_detail);
  END IF;
  IF p_mechanism = 'deduct' THEN
    IF p_amount > 0 THEN PERFORM public.trivia_ledger_raise('invalid_wallet_leg', v_detail); END IF;
    r := public.deduct_diamonds(p_user, (-p_amount)::integer, COALESCE(p_description, ''), p_kind, NULL, '{}'::jsonb, p_reference, 0);
    IF COALESCE((r ->> 'success')::boolean, false) IS NOT TRUE THEN
      v_err := r ->> 'error';
      PERFORM public.trivia_ledger_raise(CASE WHEN v_err = 'Insufficient diamonds' THEN 'insufficient_funds'
                                               WHEN v_err = 'idempotency_conflict' THEN 'reference_already_used_outside_ledger'
                                               WHEN v_err = 'User not found' THEN 'wallet_not_found'
                                               ELSE 'wallet_refused' END, v_detail || jsonb_build_object('platform', r));
    END IF;
    IF COALESCE((r ->> 'idempotent')::boolean, false) THEN
      PERFORM public.trivia_ledger_raise('reference_already_used_outside_ledger', v_detail || jsonb_build_object('platform', r));
    END IF;
    IF (r ->> 'charged')::bigint IS DISTINCT FROM -p_amount THEN
      PERFORM public.trivia_ledger_raise('platform_amount_mismatch', v_detail || jsonb_build_object('platform', r));
    END IF;
  ELSIF p_mechanism = 'add' THEN
    r := public.add_diamonds_to_balance(p_user, p_amount::integer, p_kind, p_description, p_reference);
    IF COALESCE((r ->> 'success')::boolean, false) IS NOT TRUE THEN
      v_err := r ->> 'error';
      PERFORM public.trivia_ledger_raise(CASE WHEN v_err = 'insufficient_diamonds' THEN 'insufficient_funds'
                                               WHEN COALESCE((r ->> 'duplicate')::boolean, false) THEN 'reference_already_used_outside_ledger'
                                               WHEN v_err = 'profile_not_found' THEN 'wallet_not_found'
                                               ELSE 'wallet_refused' END, v_detail || jsonb_build_object('platform', r));
    END IF;
    IF (r ->> 'amount')::bigint IS DISTINCT FROM p_amount OR COALESCE((r ->> 'multiplier')::numeric, 0) <> 1 THEN
      PERFORM public.trivia_ledger_raise('platform_amount_mismatch', v_detail || jsonb_build_object('platform', r));
    END IF;
  ELSE
    PERFORM public.trivia_ledger_raise('invalid_mechanism', v_detail);
  END IF;
  SELECT d.id, d.amount, d.balance_after, COALESCE(NULLIF(btrim(d.transaction_type), ''), d.type) AS kind
    INTO v_row FROM public.diamond_transactions d
   WHERE d.user_id = p_user AND d.reference_id = p_reference;
  IF NOT FOUND OR v_row.amount::bigint <> p_amount OR v_row.kind IS DISTINCT FROM p_kind THEN
    PERFORM public.trivia_ledger_raise('platform_row_mismatch', v_detail);
  END IF;
  RETURN jsonb_build_object('diamond_transaction_id', v_row.id, 'balance_after', v_row.balance_after,
                            'balance_before', v_row.balance_after - v_row.amount, 'receipt', r);
END $fn$;

-- Posts one balanced journal. p_lines: [{account, amount, user_id?, participant_kind?, memo?,
--   wallet legs: wallet_kind, wallet_reference, wallet_description, mechanism add|deduct|link,
--   link_tx_id (link), on_refusal fail|liability (credits)}]. Wallet legs run first, ordered by
-- (user, reference); then internal accounts are locked in code order, floors are enforced, and
-- the header and all lines are written in one statement each. Raises TL001 on any failure.
CREATE OR REPLACE FUNCTION public.trivia_ledger_post(p_header jsonb, p_lines jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_id uuid := gen_random_uuid();
  v_final jsonb := '[]'::jsonb;
  v_resolved jsonb := '{}'::jsonb;
  v_deltas jsonb := '{}'::jsonb;
  rec record; l jsonb; m jsonb; a record; v_row record;
  v_user uuid; v_amount bigint; v_kind text; v_code text; v_err text; v_owed boolean;
  v_debit bigint := 0; v_credit bigint := 0; v_n integer; v_seq bigint; v_result jsonb; v_new bigint;
  v_line_out jsonb := '[]'::jsonb;
BEGIN
  PERFORM set_config('trivia_ledger.writer', 'on', true);
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) < 2 THEN
    PERFORM public.trivia_ledger_raise('invalid_lines', jsonb_build_object('lines', p_lines));
  END IF;
  -- 1. wallet legs through the platform (deterministic order)
  FOR rec IN
    SELECT t.ord, t.value AS l FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(value, ord)
     WHERE t.value ? 'wallet_kind' AND t.value ->> 'account' LIKE 'wallet:%'
     ORDER BY t.value ->> 'user_id', t.value ->> 'wallet_reference', t.ord
  LOOP
    l := rec.l;
    v_user := (l ->> 'user_id')::uuid;
    v_amount := (l ->> 'amount')::bigint;
    IF l ->> 'account' IS DISTINCT FROM 'wallet:' || v_user::text THEN
      PERFORM public.trivia_ledger_raise('wallet_account_mismatch', l);
    END IF;
    PERFORM public.trivia_ledger_ensure_account(l ->> 'account');
    v_owed := false;
    IF l ->> 'mechanism' = 'link' THEN
      SELECT d.id, d.user_id, d.amount, d.balance_after, COALESCE(NULLIF(btrim(d.transaction_type), ''), d.type) AS kind
        INTO v_row FROM public.diamond_transactions d WHERE d.id = (l ->> 'link_tx_id')::uuid;
      IF NOT FOUND OR v_row.user_id <> v_user OR v_row.amount::bigint <> v_amount THEN
        PERFORM public.trivia_ledger_raise('platform_row_mismatch', l);
      END IF;
      m := jsonb_build_object('diamond_transaction_id', v_row.id, 'balance_after', v_row.balance_after,
                              'balance_before', v_row.balance_after - v_row.amount, 'receipt', NULL,
                              'reconciliation_state', 'legacy_linked');
    ELSIF COALESCE(l ->> 'on_refusal', 'fail') = 'liability' AND v_amount > 0 THEN
      BEGIN
        m := public.trivia_ledger_platform_move(l ->> 'mechanism', v_user, v_amount, l ->> 'wallet_kind',
                                                l ->> 'wallet_description', l ->> 'wallet_reference')
             || jsonb_build_object('reconciliation_state', 'linked');
      EXCEPTION WHEN OTHERS THEN
        v_owed := true; v_err := SQLERRM;
      END;
    ELSE
      m := public.trivia_ledger_platform_move(l ->> 'mechanism', v_user, v_amount, l ->> 'wallet_kind',
                                              l ->> 'wallet_description', l ->> 'wallet_reference')
           || jsonb_build_object('reconciliation_state', 'linked');
    END IF;
    IF v_owed THEN
      -- the credit could not land: the player is owed it (refund liability), nothing is lost
      l := jsonb_build_object('account', 'liability:refund:' || v_user::text, 'amount', v_amount, 'user_id', v_user,
                              'participant_kind', l ->> 'participant_kind',
                              'memo', 'owed: ' || COALESCE(l ->> 'wallet_kind', '') || ' ' || COALESCE(l ->> 'wallet_reference', '')
                                      || ' refused (' || left(COALESCE(v_err, ''), 160) || ')');
      v_resolved := v_resolved || jsonb_build_object(rec.ord::text, l);
    ELSE
      v_resolved := v_resolved || jsonb_build_object(rec.ord::text, l || m);
    END IF;
  END LOOP;
  -- 2. assemble lines in caller order; accumulate internal deltas
  FOR rec IN SELECT t.ord, t.value AS l FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(value, ord) ORDER BY t.ord LOOP
    l := COALESCE(v_resolved -> rec.ord::text, rec.l);
    v_amount := (l ->> 'amount')::bigint;
    IF v_amount IS NULL OR v_amount = 0 THEN
      PERFORM public.trivia_ledger_raise('invalid_line_amount', l);
    END IF;
    IF l ? 'diamond_transaction_id' THEN
      NULL;
    ELSIF (l ->> 'account') LIKE 'wallet:%' THEN
      PERFORM public.trivia_ledger_raise('wallet_leg_not_executed', l);
    ELSE
      PERFORM public.trivia_ledger_ensure_account(l ->> 'account');
      v_deltas := v_deltas || jsonb_build_object(l ->> 'account',
                  COALESCE((v_deltas ->> (l ->> 'account'))::bigint, 0) + v_amount);
    END IF;
    IF v_amount < 0 THEN v_debit := v_debit - v_amount; ELSE v_credit := v_credit + v_amount; END IF;
    v_final := v_final || jsonb_build_array(l);
  END LOOP;
  IF v_debit <> v_credit THEN
    PERFORM public.trivia_ledger_raise('journal_does_not_balance', jsonb_build_object('debit', v_debit, 'credit', v_credit));
  END IF;
  -- 3. internal accounts: lock in code order, enforce state and floors, compute before/after
  FOR a IN
    SELECT acc.* FROM public.trivia_ledger_accounts acc
     WHERE acc.account_code IN (SELECT jsonb_object_keys(v_deltas))
     ORDER BY acc.account_code FOR UPDATE
  LOOP
    IF a.state <> 'open' THEN
      PERFORM public.trivia_ledger_raise('account_closed', jsonb_build_object('account', a.account_code));
    END IF;
    v_new := a.balance + (v_deltas ->> a.account_code)::bigint;
    IF a.min_balance IS NOT NULL AND v_new < a.min_balance THEN
      PERFORM public.trivia_ledger_raise('insufficient_funds', jsonb_build_object('account', a.account_code,
        'balance', a.balance, 'delta', (v_deltas ->> a.account_code)::bigint, 'min_balance', a.min_balance));
    END IF;
  END LOOP;
  -- running before/after per internal line in caller order
  v_n := 0;
  FOR rec IN SELECT t.ord, t.value AS l FROM jsonb_array_elements(v_final) WITH ORDINALITY AS t(value, ord) ORDER BY t.ord LOOP
    l := rec.l;
    IF NOT (l ? 'diamond_transaction_id') THEN
      SELECT acc.balance + COALESCE((SELECT sum((x.value ->> 'amount')::bigint)
                                       FROM jsonb_array_elements(v_final) WITH ORDINALITY AS x(value, ord)
                                      WHERE x.ord < rec.ord AND x.value ->> 'account' = l ->> 'account'
                                        AND NOT (x.value ? 'diamond_transaction_id')), 0)
        INTO v_new FROM public.trivia_ledger_accounts acc WHERE acc.account_code = l ->> 'account';
      l := l || jsonb_build_object('balance_before', v_new, 'balance_after', v_new + (l ->> 'amount')::bigint,
                                   'reconciliation_state', 'internal');
    END IF;
    v_line_out := v_line_out || jsonb_build_array(l || jsonb_build_object('line_no', rec.ord));
  END LOOP;
  v_n := jsonb_array_length(v_line_out);
  v_result := jsonb_build_object(
    'success', true, 'replayed', false, 'journal_id', v_id, 'operation', p_header ->> 'operation',
    'idempotency_key', p_header ->> 'idempotency_key', 'settlement_id', p_header ->> 'settlement_id',
    'lines', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                'line_no', (x ->> 'line_no')::integer, 'account', x ->> 'account', 'amount', (x ->> 'amount')::bigint,
                'user_id', x ->> 'user_id', 'participant_kind', x ->> 'participant_kind',
                'wallet_reference', x ->> 'wallet_reference', 'wallet_kind', x ->> 'wallet_kind',
                'diamond_transaction_id', x ->> 'diamond_transaction_id',
                'balance_before', (x ->> 'balance_before')::bigint, 'balance_after', (x ->> 'balance_after')::bigint,
                'memo', x ->> 'memo')) ORDER BY (x ->> 'line_no')::integer)
              FROM jsonb_array_elements(v_line_out) AS x));
  PERFORM set_config('trivia_ledger.open_journal', v_id::text, true);
  INSERT INTO public.trivia_ledger_journals (id, idempotency_key, request_hash, operation, source_event, source_type, source_id,
      subject_type, subject_id, settlement_id, rules_version_id, actor_kind, actor_id, funding_source, line_count,
      total_debit, total_credit, reverses_journal_id, approval, request, result, caller_role)
  VALUES (v_id, p_header ->> 'idempotency_key', public.trivia_ledger_sha256((p_header -> 'request')::text),
      p_header ->> 'operation', COALESCE(p_header ->> 'source_event', p_header ->> 'operation'),
      p_header ->> 'source_type', p_header ->> 'source_id', p_header ->> 'subject_type', (p_header ->> 'subject_id')::uuid,
      (p_header ->> 'settlement_id')::uuid, p_header ->> 'rules_version_id', COALESCE(p_header ->> 'actor_kind', 'system'),
      (p_header ->> 'actor_id')::uuid, p_header ->> 'funding_source', v_n, v_debit, v_credit,
      (p_header ->> 'reverses_journal_id')::uuid, p_header -> 'approval', p_header -> 'request', v_result,
      COALESCE(auth.role(), session_user))
  RETURNING journal_seq INTO v_seq;
  INSERT INTO public.trivia_ledger_lines (journal_id, line_no, account_code, account_kind, amount, balance_before, balance_after,
      user_id, participant_kind, wallet_reference, wallet_kind, diamond_transaction_id, platform_receipt, memo, reconciliation_state)
  SELECT v_id, (x ->> 'line_no')::integer, x ->> 'account', acc.kind, (x ->> 'amount')::bigint,
         (x ->> 'balance_before')::bigint, (x ->> 'balance_after')::bigint, (x ->> 'user_id')::uuid, x ->> 'participant_kind',
         CASE WHEN acc.kind = 'player_wallet' THEN COALESCE(x ->> 'wallet_reference', 'legacy-noref:' || (x ->> 'diamond_transaction_id')) END,
         CASE WHEN acc.kind = 'player_wallet' THEN x ->> 'wallet_kind' END,
         (x ->> 'diamond_transaction_id')::uuid, x -> 'receipt', x ->> 'memo', x ->> 'reconciliation_state'
    FROM jsonb_array_elements(v_line_out) AS x
    JOIN public.trivia_ledger_accounts acc ON acc.account_code = x ->> 'account';
  UPDATE public.trivia_ledger_accounts acc SET balance = acc.balance + d.delta
    FROM (SELECT key AS code, value::bigint AS delta FROM jsonb_each_text(v_deltas)) d
   WHERE acc.account_code = d.code;
  PERFORM set_config('trivia_ledger.open_journal', '', true);
  RETURN v_result || jsonb_build_object('journal_seq', v_seq);
END $fn$;

-- ---------------------------------------------------------------------------------------------
-- 7. Money operations (each is atomic by itself and returns {success:false,error} on failure)
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_ledger_config_value(p_key text)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT value FROM public.trivia_ledger_config WHERE key = p_key;
$fn$;

CREATE OR REPLACE FUNCTION public.trivia_ledger_switch_enabled(p_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT COALESCE((SELECT enabled FROM public.trivia_ledger_switches WHERE key = p_key), false);
$fn$;

-- Locks the settlement for an entry and validates it against the settlement's rules version.
CREATE OR REPLACE FUNCTION public.trivia_ledger_entry_settlement(p_subject_type text, p_subject_id uuid, p_user_id uuid, p_amount bigint)
RETURNS public.trivia_settlements LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE s public.trivia_settlements%ROWTYPE; v_rules jsonb; v_n integer; v_ok boolean;
BEGIN
  SELECT * INTO s FROM public.trivia_settlements WHERE subject_type = p_subject_type AND subject_id = p_subject_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public.trivia_ledger_raise('settlement_not_found', jsonb_build_object('subject_type', p_subject_type, 'subject_id', p_subject_id));
  END IF;
  IF s.state <> 'open' THEN
    PERFORM public.trivia_ledger_raise('settlement_not_open', jsonb_build_object('state', s.state));
  END IF;
  IF p_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    PERFORM public.trivia_ledger_raise('invalid_request', jsonb_build_object('user_id', p_user_id, 'amount', p_amount));
  END IF;
  IF EXISTS (SELECT 1 FROM public.trivia_settlement_participants WHERE settlement_id = s.id AND user_id = p_user_id) THEN
    PERFORM public.trivia_ledger_raise('participant_already_entered', jsonb_build_object('user_id', p_user_id));
  END IF;
  SELECT rules INTO v_rules FROM public.trivia_rules_versions WHERE id = s.rules_version_id;
  SELECT count(*) INTO v_n FROM public.trivia_settlement_participants WHERE settlement_id = s.id;
  IF p_subject_type = 'pvp_match' THEN
    SELECT p_user_id IN (m.player1_id, m.player2_id) INTO v_ok FROM public.trivia_pvp_matches m WHERE m.id = p_subject_id;
    IF NOT COALESCE(v_ok, false) THEN
      PERFORM public.trivia_ledger_raise('not_a_match_player', jsonb_build_object('user_id', p_user_id));
    END IF;
    IF NOT ((v_rules -> 'stakes') @> to_jsonb(p_amount)) THEN
      PERFORM public.trivia_ledger_raise('amount_not_allowed_by_rules', jsonb_build_object('amount', p_amount, 'rules', s.rules_version_id));
    END IF;
    IF v_n >= 2 THEN
      PERFORM public.trivia_ledger_raise('seats_full', jsonb_build_object('participants', v_n));
    END IF;
  ELSE
    IF p_amount <> (v_rules -> 'entry' ->> 'fee')::bigint THEN
      PERFORM public.trivia_ledger_raise('amount_not_allowed_by_rules', jsonb_build_object('amount', p_amount, 'rules', s.rules_version_id));
    END IF;
    IF v_n >= COALESCE((v_rules -> 'field' ->> 'bracket_size')::integer, 256) THEN
      PERFORM public.trivia_ledger_raise('field_full', jsonb_build_object('participants', v_n));
    END IF;
  END IF;
  RETURN s;
END $fn$;

CREATE OR REPLACE FUNCTION public.trivia_ledger_hold(p_idempotency_key text, p_subject_type text, p_subject_id uuid,
  p_user_id uuid, p_amount integer, p_wallet_kind text, p_description text,
  p_participant_kind text DEFAULT 'human', p_context jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_req jsonb; v_pre jsonb; s public.trivia_settlements%ROWTYPE; v_res jsonb; v_detail text;
BEGIN
  v_req := jsonb_build_object('op', 'hold', 'subject_type', p_subject_type, 'subject_id', p_subject_id, 'user_id', p_user_id,
                              'amount', p_amount, 'wallet_kind', p_wallet_kind, 'participant_kind', p_participant_kind);
  BEGIN
    v_pre := public.trivia_ledger_begin(p_idempotency_key, 'hold', v_req);
    IF v_pre IS NOT NULL THEN RETURN v_pre; END IF;
    IF p_participant_kind IS DISTINCT FROM 'human' THEN
      PERFORM public.trivia_ledger_raise('horse_seats_use_subsidy');
    END IF;
    IF NOT ((p_subject_type = 'pvp_match' AND p_wallet_kind = 'pvp_stake')
            OR (p_subject_type = 'tournament' AND p_wallet_kind = 'tournament_entry')) THEN
      PERFORM public.trivia_ledger_raise('invalid_wallet_kind', jsonb_build_object('wallet_kind', p_wallet_kind, 'subject_type', p_subject_type));
    END IF;
    s := public.trivia_ledger_entry_settlement(p_subject_type, p_subject_id, p_user_id, p_amount);
    v_res := public.trivia_ledger_post(
      jsonb_build_object('idempotency_key', p_idempotency_key, 'operation', 'hold', 'request', v_req,
        'source_event', p_subject_type || '.entry_held', 'source_type', p_subject_type, 'source_id', p_subject_id::text,
        'subject_type', p_subject_type, 'subject_id', p_subject_id, 'settlement_id', s.id, 'rules_version_id', s.rules_version_id,
        'actor_kind', 'human', 'actor_id', p_user_id, 'funding_source', 'player_wallet'),
      jsonb_build_array(
        jsonb_build_object('account', 'wallet:' || p_user_id::text, 'amount', -p_amount, 'user_id', p_user_id, 'participant_kind', 'human',
                           'wallet_kind', p_wallet_kind, 'wallet_reference', p_idempotency_key,
                           'wallet_description', p_description, 'mechanism', 'add'),
        jsonb_build_object('account', s.escrow_account_code, 'amount', p_amount, 'user_id', p_user_id,
                           'participant_kind', 'human', 'memo', 'entry held')));
    INSERT INTO public.trivia_settlement_participants (settlement_id, user_id, participant_kind, funding_source,
        entry_amount, hold_journal_id, hold_reference)
    VALUES (s.id, p_user_id, 'human', 'player_wallet', p_amount, (v_res ->> 'journal_id')::uuid, p_idempotency_key);
    UPDATE public.trivia_settlements SET held_total = held_total + p_amount WHERE id = s.id;
    INSERT INTO public.trivia_settlement_events (settlement_id, event, from_state, to_state, detail)
    VALUES (s.id, 'hold', s.state, s.state, jsonb_build_object('user_id', p_user_id, 'amount', p_amount, 'journal_id', v_res ->> 'journal_id'));
    RETURN v_res;
  EXCEPTION
    WHEN SQLSTATE 'TL001' THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
      RETURN public.trivia_ledger_error(SQLERRM, v_detail, p_idempotency_key, 'hold');
    WHEN OTHERS THEN
      RETURN public.trivia_ledger_unexpected(SQLSTATE, SQLERRM, p_idempotency_key, 'hold');
  END;
END $fn$;

-- Treasury -> escrow for a horse seat. Fails closed when the treasury is unfunded, would drop
-- below its floor, or the daily subsidy / open exposure ceilings would be exceeded.
CREATE OR REPLACE FUNCTION public.trivia_ledger_treasury_guard(p_amount bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE t public.trivia_ledger_accounts%ROWTYPE; v_floor bigint; v_daily bigint; v_exposure bigint; v_today bigint; v_open bigint;
  v_day_start timestamptz := (date_trunc('day', now() AT TIME ZONE 'America/Chicago')) AT TIME ZONE 'America/Chicago';
BEGIN
  PERFORM public.trivia_ledger_ensure_account('treasury:trivia');
  SELECT * INTO t FROM public.trivia_ledger_accounts WHERE account_code = 'treasury:trivia' FOR UPDATE;
  v_floor := public.trivia_ledger_config_value('treasury_floor');
  v_daily := public.trivia_ledger_config_value('treasury_daily_subsidy_ceiling');
  v_exposure := public.trivia_ledger_config_value('treasury_exposure_ceiling');
  IF t.balance - p_amount < v_floor THEN
    PERFORM public.trivia_ledger_raise(CASE WHEN t.balance <= v_floor THEN 'treasury_unfunded' ELSE 'treasury_floor' END,
      jsonb_build_object('balance', t.balance, 'floor', v_floor, 'amount', p_amount));
  END IF;
  SELECT COALESCE(sum(-l.amount), 0) INTO v_today FROM public.trivia_ledger_lines l
   WHERE l.account_code = 'treasury:trivia' AND l.amount < 0 AND l.created_at >= v_day_start;
  IF v_today + p_amount > v_daily THEN
    PERFORM public.trivia_ledger_raise('treasury_daily_ceiling', jsonb_build_object('today', v_today, 'ceiling', v_daily, 'amount', p_amount));
  END IF;
  SELECT COALESCE(sum(p.entry_amount), 0) INTO v_open FROM public.trivia_settlement_participants p
    JOIN public.trivia_settlements s ON s.id = p.settlement_id
   WHERE p.funding_source = 'treasury' AND p.state = 'held' AND s.state IN ('open', 'locked');
  IF v_open + p_amount > v_exposure THEN
    PERFORM public.trivia_ledger_raise('treasury_exposure_ceiling', jsonb_build_object('exposure', v_open, 'ceiling', v_exposure, 'amount', p_amount));
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION public.trivia_ledger_subsidy(p_idempotency_key text, p_subject_type text, p_subject_id uuid,
  p_beneficiary_id uuid, p_amount integer, p_purpose text DEFAULT 'horse_seat', p_context jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_req jsonb; v_pre jsonb; s public.trivia_settlements%ROWTYPE; v_res jsonb; v_detail text;
BEGIN
  v_req := jsonb_build_object('op', 'subsidy', 'subject_type', p_subject_type, 'subject_id', p_subject_id,
                              'beneficiary_id', p_beneficiary_id, 'amount', p_amount, 'purpose', p_purpose);
  BEGIN
    v_pre := public.trivia_ledger_begin(p_idempotency_key, 'subsidy', v_req);
    IF v_pre IS NOT NULL THEN RETURN v_pre; END IF;
    IF p_purpose IS DISTINCT FROM 'horse_seat' THEN
      PERFORM public.trivia_ledger_raise('invalid_purpose', jsonb_build_object('purpose', p_purpose));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_beneficiary_id AND is_horse IS TRUE) THEN
      PERFORM public.trivia_ledger_raise('beneficiary_not_horse', jsonb_build_object('beneficiary_id', p_beneficiary_id));
    END IF;
    s := public.trivia_ledger_entry_settlement(p_subject_type, p_subject_id, p_beneficiary_id, p_amount);
    PERFORM public.trivia_ledger_treasury_guard(p_amount);
    v_res := public.trivia_ledger_post(
      jsonb_build_object('idempotency_key', p_idempotency_key, 'operation', 'subsidy', 'request', v_req,
        'source_event', p_subject_type || '.horse_seat_funded', 'source_type', p_subject_type, 'source_id', p_subject_id::text,
        'subject_type', p_subject_type, 'subject_id', p_subject_id, 'settlement_id', s.id, 'rules_version_id', s.rules_version_id,
        'actor_kind', 'horse', 'actor_id', p_beneficiary_id, 'funding_source', 'treasury'),
      jsonb_build_array(
        jsonb_build_object('account', 'treasury:trivia', 'amount', -p_amount, 'user_id', p_beneficiary_id,
                           'participant_kind', 'horse', 'memo', 'horse seat subsidy'),
        jsonb_build_object('account', s.escrow_account_code, 'amount', p_amount, 'user_id', p_beneficiary_id,
                           'participant_kind', 'horse', 'memo', 'horse entry held')));
    INSERT INTO public.trivia_settlement_participants (settlement_id, user_id, participant_kind, funding_source,
        entry_amount, hold_journal_id, hold_reference)
    VALUES (s.id, p_beneficiary_id, 'horse', 'treasury', p_amount, (v_res ->> 'journal_id')::uuid, p_idempotency_key);
    UPDATE public.trivia_settlements SET held_total = held_total + p_amount, subsidy_total = subsidy_total + p_amount WHERE id = s.id;
    INSERT INTO public.trivia_settlement_events (settlement_id, event, from_state, to_state, detail)
    VALUES (s.id, 'subsidy', s.state, s.state, jsonb_build_object('user_id', p_beneficiary_id, 'amount', p_amount, 'journal_id', v_res ->> 'journal_id'));
    RETURN v_res;
  EXCEPTION
    WHEN SQLSTATE 'TL001' THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
      RETURN public.trivia_ledger_error(SQLERRM, v_detail, p_idempotency_key, 'subsidy');
    WHEN OTHERS THEN
      RETURN public.trivia_ledger_unexpected(SQLSTATE, SQLERRM, p_idempotency_key, 'subsidy');
  END;
END $fn$;

-- Shared exit path for release (before lock) and refund (competitive, before terminal):
-- the participant's ORIGINAL stored entry goes back to its funding source.
CREATE OR REPLACE FUNCTION public.trivia_ledger_exit_entry(p_op text, p_idempotency_key text, p_subject_type text, p_subject_id uuid,
  p_user_id uuid, p_description text, p_wallet_kind text, p_context jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_req jsonb; v_pre jsonb; s public.trivia_settlements%ROWTYPE; p public.trivia_settlement_participants%ROWTYPE;
  v_res jsonb; v_kind text; v_dest jsonb; v_refusal text := COALESCE(p_context ->> 'on_wallet_refusal', 'fail');
BEGIN
  v_req := jsonb_build_object('op', p_op, 'subject_type', p_subject_type, 'subject_id', p_subject_id, 'user_id', p_user_id,
                              'wallet_kind', p_wallet_kind, 'on_wallet_refusal', v_refusal);
  v_pre := public.trivia_ledger_begin(p_idempotency_key, p_op, v_req);
  IF v_pre IS NOT NULL THEN RETURN v_pre; END IF;
  IF v_refusal NOT IN ('fail', 'liability') THEN
    PERFORM public.trivia_ledger_raise('invalid_request', jsonb_build_object('on_wallet_refusal', v_refusal));
  END IF;
  SELECT * INTO s FROM public.trivia_settlements WHERE subject_type = p_subject_type AND subject_id = p_subject_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public.trivia_ledger_raise('settlement_not_found', jsonb_build_object('subject_type', p_subject_type, 'subject_id', p_subject_id));
  END IF;
  IF (p_op = 'release' AND s.state <> 'open') OR (p_op = 'refund' AND s.state NOT IN ('open', 'locked')) THEN
    PERFORM public.trivia_ledger_raise(CASE WHEN p_op = 'release' THEN 'settlement_not_open' ELSE 'settlement_terminal' END,
                                       jsonb_build_object('state', s.state));
  END IF;
  SELECT * INTO p FROM public.trivia_settlement_participants WHERE settlement_id = s.id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR p.state <> 'held' THEN
    PERFORM public.trivia_ledger_raise('participant_not_held', jsonb_build_object('user_id', p_user_id, 'state', p.state));
  END IF;
  v_kind := COALESCE(p_wallet_kind, CASE WHEN p_subject_type = 'pvp_match' THEN 'pvp_refund'
                                         WHEN p_op = 'release' THEN 'tournament_entry_refund' ELSE 'tournament_cancel_refund' END);
  IF NOT ((p_subject_type = 'pvp_match' AND v_kind = 'pvp_refund')
          OR (p_subject_type = 'tournament' AND v_kind IN ('tournament_entry_refund', 'tournament_cancel_refund'))) THEN
    PERFORM public.trivia_ledger_raise('invalid_wallet_kind', jsonb_build_object('wallet_kind', v_kind));
  END IF;
  IF p.funding_source = 'treasury' THEN
    v_dest := jsonb_build_object('account', 'treasury:trivia', 'amount', p.entry_amount, 'user_id', p_user_id,
                                 'participant_kind', p.participant_kind, 'memo', 'horse entry returned to treasury (' || p_op || ')');
  ELSE
    v_dest := jsonb_build_object('account', 'wallet:' || p_user_id::text, 'amount', p.entry_amount, 'user_id', p_user_id,
                                 'participant_kind', p.participant_kind, 'wallet_kind', v_kind, 'wallet_reference', p_idempotency_key,
                                 'wallet_description', p_description, 'mechanism', 'add', 'on_refusal', v_refusal);
  END IF;
  v_res := public.trivia_ledger_post(
    jsonb_build_object('idempotency_key', p_idempotency_key, 'operation', p_op, 'request', v_req,
      'source_event', p_subject_type || '.entry_' || CASE WHEN p_op = 'release' THEN 'released' ELSE 'refunded' END,
      'source_type', p_subject_type, 'source_id', p_subject_id::text, 'subject_type', p_subject_type, 'subject_id', p_subject_id,
      'settlement_id', s.id, 'rules_version_id', s.rules_version_id, 'actor_kind', 'system', 'funding_source', 'escrow'),
    jsonb_build_array(
      jsonb_build_object('account', s.escrow_account_code, 'amount', -p.entry_amount, 'user_id', p_user_id,
                         'participant_kind', p.participant_kind, 'memo', 'entry ' || p_op),
      v_dest));
  UPDATE public.trivia_settlement_participants
     SET state = CASE WHEN p_op = 'release' THEN 'released' ELSE 'refunded' END, refund_amount = p.entry_amount,
         exit_journal_id = (v_res ->> 'journal_id')::uuid
   WHERE settlement_id = s.id AND user_id = p_user_id;
  IF p_op = 'release' THEN
    UPDATE public.trivia_settlements SET released_total = released_total + p.entry_amount WHERE id = s.id;
  ELSE
    UPDATE public.trivia_settlements SET refunded_total = refunded_total + p.entry_amount WHERE id = s.id;
  END IF;
  INSERT INTO public.trivia_settlement_events (settlement_id, event, from_state, to_state, detail)
  VALUES (s.id, p_op, s.state, s.state, jsonb_build_object('user_id', p_user_id, 'amount', p.entry_amount, 'journal_id', v_res ->> 'journal_id'));
  RETURN v_res;
END $fn$;

CREATE OR REPLACE FUNCTION public.trivia_ledger_release(p_idempotency_key text, p_subject_type text, p_subject_id uuid,
  p_user_id uuid, p_description text, p_wallet_kind text DEFAULT NULL, p_context jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_detail text;
BEGIN
  BEGIN
    RETURN public.trivia_ledger_exit_entry('release', p_idempotency_key, p_subject_type, p_subject_id, p_user_id,
                                           p_description, p_wallet_kind, COALESCE(p_context, '{}'::jsonb));
  EXCEPTION
    WHEN SQLSTATE 'TL001' THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
      RETURN public.trivia_ledger_error(SQLERRM, v_detail, p_idempotency_key, 'release');
    WHEN OTHERS THEN
      RETURN public.trivia_ledger_unexpected(SQLSTATE, SQLERRM, p_idempotency_key, 'release');
  END;
END $fn$;

CREATE OR REPLACE FUNCTION public.trivia_ledger_refund(p_idempotency_key text, p_subject_type text, p_subject_id uuid,
  p_user_id uuid, p_description text, p_wallet_kind text DEFAULT NULL, p_context jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_detail text; v_req jsonb; v_pre jsonb; e public.trivia_ledger_lines%ROWTYPE; v_amount bigint;
BEGIN
  BEGIN
    IF p_subject_type IN ('pvp_match', 'tournament') THEN
      RETURN public.trivia_ledger_exit_entry('refund', p_idempotency_key, p_subject_type, p_subject_id, p_user_id,
                                             p_description, p_wallet_kind, COALESCE(p_context, '{}'::jsonb));
    END IF;
    IF p_subject_type IS DISTINCT FROM 'trivia_session' THEN
      PERFORM public.trivia_ledger_raise('invalid_subject_type', jsonb_build_object('subject_type', p_subject_type));
    END IF;
    -- Solo entry refund: exactly the journaled entry fee, once per session, from solo entry revenue.
    v_req := jsonb_build_object('op', 'refund', 'subject_type', p_subject_type, 'subject_id', p_subject_id, 'user_id', p_user_id);
    v_pre := public.trivia_ledger_begin(p_idempotency_key, 'refund', v_req);
    IF v_pre IS NOT NULL THEN RETURN v_pre; END IF;
    IF p_idempotency_key IS DISTINCT FROM 'trivia_entry_refund_' || p_subject_id::text THEN
      PERFORM public.trivia_ledger_raise('invalid_idempotency_key', jsonb_build_object('expected', 'trivia_entry_refund_' || p_subject_id::text));
    END IF;
    SELECT l.* INTO e FROM public.trivia_ledger_lines l JOIN public.trivia_ledger_journals j ON j.id = l.journal_id
     WHERE j.idempotency_key = 'trivia_entry_' || p_subject_id::text AND j.operation = 'debit' AND l.account_kind = 'player_wallet';
    IF NOT FOUND OR e.user_id IS DISTINCT FROM p_user_id THEN
      PERFORM public.trivia_ledger_raise('entry_not_journaled', jsonb_build_object('session_id', p_subject_id));
    END IF;
    v_amount := -e.amount;
    RETURN public.trivia_ledger_post(
      jsonb_build_object('idempotency_key', p_idempotency_key, 'operation', 'refund', 'request', v_req,
        'source_event', 'trivia_session.entry_refunded', 'source_type', 'trivia_session', 'source_id', p_subject_id::text,
        'subject_type', 'trivia_session', 'subject_id', p_subject_id, 'actor_kind', 'system', 'funding_source', 'house_revenue',
        'rules_version_id', (SELECT rules_version_id FROM public.trivia_ledger_journals WHERE id = e.journal_id)),
      jsonb_build_array(
        jsonb_build_object('account', 'house:entry:solo', 'amount', -v_amount, 'user_id', p_user_id, 'memo', 'solo entry refunded'),
        jsonb_build_object('account', 'wallet:' || p_user_id::text, 'amount', v_amount, 'user_id', p_user_id, 'participant_kind', 'human',
                           'wallet_kind', 'refund', 'wallet_reference', p_idempotency_key, 'wallet_description', p_description,
                           'mechanism', 'add')));
  EXCEPTION
    WHEN SQLSTATE 'TL001' THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
      RETURN public.trivia_ledger_error(SQLERRM, v_detail, p_idempotency_key, 'refund');
    WHEN OTHERS THEN
      RETURN public.trivia_ledger_unexpected(SQLSTATE, SQLERRM, p_idempotency_key, 'refund');
  END;
END $fn$;

CREATE OR REPLACE FUNCTION public.trivia_ledger_rake(p_idempotency_key text, p_subject_type text, p_subject_id uuid,
  p_amount integer, p_description text, p_context jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_req jsonb; v_pre jsonb; s public.trivia_settlements%ROWTYPE; v_res jsonb; v_detail text;
BEGIN
  v_req := jsonb_build_object('op', 'rake', 'subject_type', p_subject_type, 'subject_id', p_subject_id, 'amount', p_amount);
  BEGIN
    v_pre := public.trivia_ledger_begin(p_idempotency_key, 'rake', v_req);
    IF v_pre IS NOT NULL THEN RETURN v_pre; END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
      PERFORM public.trivia_ledger_raise('invalid_request', jsonb_build_object('amount', p_amount));
    END IF;
    SELECT * INTO s FROM public.trivia_settlements WHERE subject_type = p_subject_type AND subject_id = p_subject_id FOR UPDATE;
    IF NOT FOUND OR s.state <> 'locked' THEN
      PERFORM public.trivia_ledger_raise('settlement_not_locked', jsonb_build_object('state', s.state));
    END IF;
    v_res := public.trivia_ledger_post(
      jsonb_build_object('idempotency_key', p_idempotency_key, 'operation', 'rake', 'request', v_req,
        'source_event', p_subject_type || '.rake', 'source_type', p_subject_type, 'source_id', p_subject_id::text,
        'subject_type', p_subject_type, 'subject_id', p_subject_id, 'settlement_id', s.id, 'rules_version_id', s.rules_version_id,
        'actor_kind', 'system', 'funding_source', 'escrow'),
      jsonb_build_array(
        jsonb_build_object('account', s.escrow_account_code, 'amount', -p_amount, 'memo', COALESCE(p_description, 'rake')),
        jsonb_build_object('account', CASE WHEN p_subject_type = 'pvp_match' THEN 'house:rake:pvp' ELSE 'house:rake:tournament' END,
                           'amount', p_amount, 'memo', COALESCE(p_description, 'rake'))));
    UPDATE public.trivia_settlements SET rake_amount = rake_amount + p_amount WHERE id = s.id;
    INSERT INTO public.trivia_settlement_events (settlement_id, event, from_state, to_state, detail)
    VALUES (s.id, 'rake', s.state, s.state, jsonb_build_object('amount', p_amount, 'journal_id', v_res ->> 'journal_id'));
    RETURN v_res;
  EXCEPTION
    WHEN SQLSTATE 'TL001' THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
      RETURN public.trivia_ledger_error(SQLERRM, v_detail, p_idempotency_key, 'rake');
    WHEN OTHERS THEN
      RETURN public.trivia_ledger_unexpected(SQLSTATE, SQLERRM, p_idempotency_key, 'rake');
  END;
END $fn$;

CREATE OR REPLACE FUNCTION public.trivia_ledger_debit(p_idempotency_key text, p_user_id uuid, p_amount integer,
  p_wallet_kind text, p_description text, p_source_type text, p_source_id text,
  p_rules_version_id text DEFAULT NULL, p_context jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_req jsonb; v_pre jsonb; v_detail text; v_house text; v_mech text;
BEGIN
  v_req := jsonb_build_object('op', 'debit', 'user_id', p_user_id, 'amount', p_amount, 'wallet_kind', p_wallet_kind,
                              'source_type', p_source_type, 'source_id', p_source_id);
  BEGIN
    v_pre := public.trivia_ledger_begin(p_idempotency_key, 'debit', v_req);
    IF v_pre IS NOT NULL THEN RETURN v_pre; END IF;
    IF p_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
      PERFORM public.trivia_ledger_raise('invalid_request', jsonb_build_object('user_id', p_user_id, 'amount', p_amount));
    END IF;
    IF p_wallet_kind = 'trivia_entry' THEN v_house := 'house:entry:solo'; v_mech := 'add';
    ELSIF p_wallet_kind = 'trivia_lifeline' THEN v_house := 'house:spend:lifeline'; v_mech := 'deduct';
    ELSE PERFORM public.trivia_ledger_raise('invalid_wallet_kind', jsonb_build_object('wallet_kind', p_wallet_kind));
    END IF;
    RETURN public.trivia_ledger_post(
      jsonb_build_object('idempotency_key', p_idempotency_key, 'operation', 'debit', 'request', v_req,
        'source_event', COALESCE(p_source_type, 'trivia') || '.' || p_wallet_kind, 'source_type', p_source_type, 'source_id', p_source_id,
        'subject_type', CASE WHEN p_source_type = 'trivia_session' THEN 'trivia_session' END,
        'subject_id', CASE WHEN p_source_type = 'trivia_session' THEN p_source_id END,
        'rules_version_id', p_rules_version_id, 'actor_kind', 'human', 'actor_id', p_user_id, 'funding_source', 'player_wallet'),
      jsonb_build_array(
        jsonb_build_object('account', 'wallet:' || p_user_id::text, 'amount', -p_amount, 'user_id', p_user_id, 'participant_kind', 'human',
                           'wallet_kind', p_wallet_kind, 'wallet_reference', p_idempotency_key, 'wallet_description', p_description,
                           'mechanism', v_mech),
        jsonb_build_object('account', v_house, 'amount', p_amount, 'user_id', p_user_id, 'memo', p_wallet_kind)));
  EXCEPTION
    WHEN SQLSTATE 'TL001' THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
      RETURN public.trivia_ledger_error(SQLERRM, v_detail, p_idempotency_key, 'debit');
    WHEN OTHERS THEN
      RETURN public.trivia_ledger_unexpected(SQLSTATE, SQLERRM, p_idempotency_key, 'debit');
  END;
END $fn$;

CREATE OR REPLACE FUNCTION public.trivia_ledger_payout(p_idempotency_key text, p_user_id uuid, p_amount integer,
  p_wallet_kind text, p_description text, p_funding text, p_source_type text, p_source_id text,
  p_subject_type text DEFAULT NULL, p_subject_id uuid DEFAULT NULL, p_rules_version_id text DEFAULT NULL,
  p_context jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_req jsonb; v_pre jsonb; v_detail text; v_from text;
BEGIN
  v_req := jsonb_build_object('op', 'payout', 'user_id', p_user_id, 'amount', p_amount, 'wallet_kind', p_wallet_kind,
                              'funding', p_funding, 'source_type', p_source_type, 'source_id', p_source_id,
                              'subject_type', p_subject_type, 'subject_id', p_subject_id);
  BEGIN
    v_pre := public.trivia_ledger_begin(p_idempotency_key, 'payout', v_req);
    IF v_pre IS NOT NULL THEN RETURN v_pre; END IF;
    IF p_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
      PERFORM public.trivia_ledger_raise('invalid_request', jsonb_build_object('user_id', p_user_id, 'amount', p_amount));
    END IF;
    IF p_funding = 'platform_issuance' THEN
      IF p_wallet_kind NOT IN ('trivia_run', 'trivia_daily_bonus', 'trivia_prize_wheel') THEN
        PERFORM public.trivia_ledger_raise('invalid_wallet_kind', jsonb_build_object('wallet_kind', p_wallet_kind, 'funding', p_funding));
      END IF;
      v_from := 'issuance:' || p_wallet_kind;
    ELSIF p_funding = 'treasury' THEN
      IF p_wallet_kind IS DISTINCT FROM 'tournament_prize' THEN
        PERFORM public.trivia_ledger_raise('invalid_wallet_kind', jsonb_build_object('wallet_kind', p_wallet_kind, 'funding', p_funding));
      END IF;
      PERFORM public.trivia_ledger_treasury_guard(p_amount);
      v_from := 'treasury:trivia';
    ELSIF p_funding = 'refund_liability' THEN
      IF p_wallet_kind NOT IN ('pvp_win', 'pvp_refund', 'tournament_prize', 'tournament_entry_refund', 'tournament_cancel_refund', 'refund') THEN
        PERFORM public.trivia_ledger_raise('invalid_wallet_kind', jsonb_build_object('wallet_kind', p_wallet_kind, 'funding', p_funding));
      END IF;
      v_from := 'liability:refund:' || p_user_id::text;
    ELSIF p_funding = 'escrow' THEN
      PERFORM public.trivia_ledger_raise('use_trivia_settlement_settle');
    ELSE
      PERFORM public.trivia_ledger_raise('invalid_funding', jsonb_build_object('funding', p_funding));
    END IF;
    RETURN public.trivia_ledger_post(
      jsonb_build_object('idempotency_key', p_idempotency_key, 'operation', 'payout', 'request', v_req,
        'source_event', COALESCE(p_source_type, 'trivia') || '.' || p_wallet_kind, 'source_type', p_source_type, 'source_id', p_source_id,
        'subject_type', p_subject_type, 'subject_id', p_subject_id, 'rules_version_id', p_rules_version_id,
        'actor_kind', COALESCE(p_context ->> 'actor_kind', 'human'), 'actor_id', p_user_id, 'funding_source', p_funding),
      jsonb_build_array(
        jsonb_build_object('account', v_from, 'amount', -p_amount, 'user_id', p_user_id, 'memo', p_wallet_kind),
        jsonb_build_object('account', 'wallet:' || p_user_id::text, 'amount', p_amount, 'user_id', p_user_id, 'participant_kind', 'human',
                           'wallet_kind', p_wallet_kind, 'wallet_reference', p_idempotency_key, 'wallet_description', p_description,
                           'mechanism', 'add')));
  EXCEPTION
    WHEN SQLSTATE 'TL001' THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
      RETURN public.trivia_ledger_error(SQLERRM, v_detail, p_idempotency_key, 'payout');
    WHEN OTHERS THEN
      RETURN public.trivia_ledger_unexpected(SQLSTATE, SQLERRM, p_idempotency_key, 'payout');
  END;
END $fn$;

-- ---------------------------------------------------------------------------------------------
-- 8. Settlement primitives
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_settlement_open(p_subject_type text, p_subject_id uuid, p_rules_version_id text,
  p_context jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE s public.trivia_settlements%ROWTYPE; v_family text; v_code text; v_key text; v_detail text;
BEGIN
  BEGIN
    IF p_subject_type NOT IN ('pvp_match', 'tournament') OR p_subject_id IS NULL THEN
      PERFORM public.trivia_ledger_raise('invalid_subject', jsonb_build_object('subject_type', p_subject_type, 'subject_id', p_subject_id));
    END IF;
    SELECT family INTO v_family FROM public.trivia_rules_versions WHERE id = p_rules_version_id;
    IF v_family IS NULL OR v_family <> (CASE p_subject_type WHEN 'pvp_match' THEN 'pvp' ELSE 'tournament' END) THEN
      PERFORM public.trivia_ledger_raise('invalid_rules_version', jsonb_build_object('rules_version_id', p_rules_version_id));
    END IF;
    IF EXISTS (SELECT 1 FROM public.competitive_quarantine q
                WHERE q.entity_type = CASE p_subject_type WHEN 'pvp_match' THEN 'trivia_pvp_match' ELSE 'trivia_tournament' END
                  AND q.entity_id = p_subject_id) THEN
      PERFORM public.trivia_ledger_raise('subject_quarantined');
    END IF;
    IF (p_subject_type = 'pvp_match' AND NOT EXISTS (SELECT 1 FROM public.trivia_pvp_matches WHERE id = p_subject_id))
       OR (p_subject_type = 'tournament' AND NOT EXISTS (SELECT 1 FROM public.trivia_tournaments WHERE id = p_subject_id)) THEN
      PERFORM public.trivia_ledger_raise('subject_not_found');
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('trivia_settlement:' || p_subject_type || ':' || p_subject_id::text, 20260929));
    SELECT * INTO s FROM public.trivia_settlements WHERE subject_type = p_subject_type AND subject_id = p_subject_id;
    IF FOUND THEN
      IF s.rules_version_id <> p_rules_version_id THEN
        PERFORM public.trivia_ledger_raise('settlement_exists_with_other_rules', jsonb_build_object('rules_version_id', s.rules_version_id));
      END IF;
      RETURN jsonb_build_object('success', true, 'replayed', true, 'settlement_id', s.id, 'idempotency_key', s.idempotency_key,
                                'escrow_account', s.escrow_account_code, 'state', s.state, 'rules_version_id', s.rules_version_id);
    END IF;
    v_code := CASE p_subject_type WHEN 'pvp_match' THEN 'escrow:pvp:' ELSE 'escrow:tournament:' END || p_subject_id::text;
    v_key := CASE p_subject_type WHEN 'pvp_match' THEN 'pvp_settlement_' ELSE 'trivia_tourn_settlement_' END || p_subject_id::text;
    PERFORM public.trivia_ledger_ensure_account(v_code);
    INSERT INTO public.trivia_settlements (subject_type, subject_id, idempotency_key, rules_version_id, escrow_account_code, context)
    VALUES (p_subject_type, p_subject_id, v_key, p_rules_version_id, v_code, COALESCE(p_context, '{}'::jsonb))
    RETURNING * INTO s;
    INSERT INTO public.trivia_settlement_events (settlement_id, event, to_state, detail)
    VALUES (s.id, 'open', 'open', jsonb_build_object('rules_version_id', p_rules_version_id));
    RETURN jsonb_build_object('success', true, 'replayed', false, 'settlement_id', s.id, 'idempotency_key', s.idempotency_key,
                              'escrow_account', s.escrow_account_code, 'state', s.state, 'rules_version_id', s.rules_version_id);
  EXCEPTION
    WHEN SQLSTATE 'TL001' THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
      RETURN public.trivia_ledger_error(SQLERRM, v_detail, NULL, 'settlement_open');
    WHEN OTHERS THEN
      RETURN public.trivia_ledger_unexpected(SQLSTATE, SQLERRM, NULL, 'settlement_open');
  END;
END $fn$;

CREATE OR REPLACE FUNCTION public.trivia_settlement_lock_row(s public.trivia_settlements)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_escrow bigint;
BEGIN
  SELECT balance INTO v_escrow FROM public.trivia_ledger_accounts WHERE account_code = s.escrow_account_code FOR UPDATE;
  PERFORM set_config('trivia_ledger.writer', 'on', true);
  UPDATE public.trivia_settlements SET state = 'locked', gross_pool = v_escrow, locked_at = clock_timestamp() WHERE id = s.id;
  INSERT INTO public.trivia_settlement_events (settlement_id, event, from_state, to_state, detail)
  VALUES (s.id, 'lock', 'open', 'locked', jsonb_build_object('gross_pool', v_escrow));
  RETURN v_escrow;
END $fn$;

CREATE OR REPLACE FUNCTION public.trivia_settlement_lock(p_subject_type text, p_subject_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE s public.trivia_settlements%ROWTYPE; v_gross bigint; v_n integer;
BEGIN
  SELECT * INTO s FROM public.trivia_settlements WHERE subject_type = p_subject_type AND subject_id = p_subject_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'settlement_not_found');
  END IF;
  IF s.state IN ('settled', 'refunded', 'voided') THEN
    RETURN jsonb_build_object('success', false, 'error', 'settlement_terminal', 'state', s.state);
  END IF;
  IF s.state = 'locked' THEN
    v_gross := s.gross_pool;
  ELSE
    v_gross := public.trivia_settlement_lock_row(s);
  END IF;
  SELECT count(*) INTO v_n FROM public.trivia_settlement_participants WHERE settlement_id = s.id AND state = 'held';
  RETURN jsonb_build_object('success', true, 'replayed', s.state = 'locked', 'settlement_id', s.id, 'state', 'locked',
                            'gross_pool', v_gross, 'participant_count', v_n);
END $fn$;

-- ONE transaction: rake, payouts, refunds, escrow close and terminal status. RAISES on any
-- failure so the caller's stats/outcome/terminal-status writes roll back with it.
CREATE OR REPLACE FUNCTION public.trivia_settlement_settle(p_subject_type text, p_subject_id uuid, p_plan jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  s public.trivia_settlements%ROWTYPE; p public.trivia_settlement_participants%ROWTYPE;
  v_hash text; v_outcome text; v_terminal text; v_refusal text; v_rake bigint; v_escrow bigint;
  v_pay bigint := 0; v_ref bigint := 0; v_lines jsonb := '[]'::jsonb; v_post jsonb; v_journal uuid;
  x jsonb; v_user uuid; v_amount bigint; v_kind text; v_seen uuid[] := '{}'; v_refs text[] := '{}';
  v_settled_entries bigint; v_alloc bigint; v_result jsonb; v_owed jsonb := '[]'::jsonb; v_rank integer;
  v_rake_account text;
BEGIN
  IF p_subject_type NOT IN ('pvp_match', 'tournament') OR jsonb_typeof(p_plan) IS DISTINCT FROM 'object' THEN
    PERFORM public.trivia_ledger_raise('invalid_plan');
  END IF;
  SELECT * INTO s FROM public.trivia_settlements WHERE subject_type = p_subject_type AND subject_id = p_subject_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public.trivia_ledger_raise('settlement_not_found', jsonb_build_object('subject_type', p_subject_type, 'subject_id', p_subject_id));
  END IF;
  v_hash := public.trivia_ledger_sha256(p_plan::text);
  IF s.state IN ('settled', 'refunded', 'voided') THEN
    IF s.plan_hash = v_hash THEN
      INSERT INTO public.trivia_ledger_idempotency_events (idempotency_key, operation, outcome) VALUES (s.idempotency_key, 'settlement', 'replayed');
      RETURN s.result || jsonb_build_object('replayed', true);
    END IF;
    INSERT INTO public.trivia_ledger_idempotency_events (idempotency_key, operation, outcome) VALUES (s.idempotency_key, 'settlement', 'conflict');
    PERFORM public.trivia_ledger_raise('settlement_already_terminal', jsonb_build_object('state', s.state, 'settlement_id', s.id));
  END IF;
  v_outcome := p_plan ->> 'outcome';
  v_terminal := p_plan ->> 'terminal_state';
  v_refusal := COALESCE(p_plan ->> 'on_wallet_refusal', 'fail');
  v_rake := COALESCE((p_plan ->> 'rake')::bigint, 0);
  IF v_outcome IS NULL OR v_outcome NOT IN ('win', 'tie', 'forfeit', 'refund', 'void', 'prizes', 'cancelled')
     OR v_terminal IS NULL OR v_terminal NOT IN ('settled', 'refunded', 'voided') OR v_refusal NOT IN ('fail', 'liability')
     OR v_rake < 0 OR jsonb_typeof(COALESCE(p_plan -> 'payouts', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_plan -> 'refunds', '[]'::jsonb)) <> 'array' THEN
    PERFORM public.trivia_ledger_raise('invalid_plan', jsonb_build_object('plan', p_plan));
  END IF;
  PERFORM set_config('trivia_ledger.writer', 'on', true);
  IF s.state = 'open' THEN
    PERFORM public.trivia_settlement_lock_row(s);
    SELECT * INTO s FROM public.trivia_settlements WHERE id = s.id;
  END IF;
  SELECT balance INTO v_escrow FROM public.trivia_ledger_accounts WHERE account_code = s.escrow_account_code FOR UPDATE;
  v_rake_account := CASE WHEN p_subject_type = 'pvp_match' THEN 'house:rake:pvp' ELSE 'house:rake:tournament' END;
  -- payouts
  FOR x IN SELECT value FROM jsonb_array_elements(COALESCE(p_plan -> 'payouts', '[]'::jsonb)) LOOP
    v_user := (x ->> 'user_id')::uuid; v_amount := (x ->> 'amount')::bigint; v_kind := x ->> 'wallet_kind';
    SELECT * INTO p FROM public.trivia_settlement_participants WHERE settlement_id = s.id AND user_id = v_user FOR UPDATE;
    IF NOT FOUND OR p.state <> 'held' OR v_user = ANY (v_seen) OR v_amount IS NULL OR v_amount <= 0
       OR v_kind IS DISTINCT FROM (CASE WHEN p_subject_type = 'pvp_match' THEN 'pvp_win' ELSE 'tournament_prize' END)
       OR COALESCE(x ->> 'reference', '') !~ '^[A-Za-z0-9_:.@-]{8,200}$' OR (x ->> 'reference') = ANY (v_refs) THEN
      PERFORM public.trivia_ledger_raise('invalid_plan_payout', jsonb_build_object('payout', x));
    END IF;
    v_seen := v_seen || v_user; v_refs := v_refs || (x ->> 'reference'); v_pay := v_pay + v_amount;
    IF p.funding_source = 'treasury' THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account', 'treasury:trivia', 'amount', v_amount, 'user_id', v_user,
                   'participant_kind', p.participant_kind, 'memo', 'horse prize to treasury (' || (x ->> 'reference') || ')'));
    ELSE
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account', 'wallet:' || v_user::text, 'amount', v_amount, 'user_id', v_user,
                   'participant_kind', p.participant_kind, 'wallet_kind', v_kind, 'wallet_reference', x ->> 'reference',
                   'wallet_description', x ->> 'description', 'mechanism', 'add', 'on_refusal', v_refusal));
    END IF;
  END LOOP;
  -- refunds: always the participant's original stored entry
  FOR x IN SELECT value FROM jsonb_array_elements(COALESCE(p_plan -> 'refunds', '[]'::jsonb)) LOOP
    v_user := (x ->> 'user_id')::uuid; v_kind := x ->> 'wallet_kind';
    SELECT * INTO p FROM public.trivia_settlement_participants WHERE settlement_id = s.id AND user_id = v_user FOR UPDATE;
    IF NOT FOUND OR p.state <> 'held' OR v_user = ANY (v_seen)
       OR (x ? 'amount' AND (x ->> 'amount')::bigint IS DISTINCT FROM p.entry_amount)
       OR NOT ((p_subject_type = 'pvp_match' AND v_kind = 'pvp_refund')
               OR (p_subject_type = 'tournament' AND v_kind IN ('tournament_entry_refund', 'tournament_cancel_refund')))
       OR COALESCE(x ->> 'reference', '') !~ '^[A-Za-z0-9_:.@-]{8,200}$' OR (x ->> 'reference') = ANY (v_refs) THEN
      PERFORM public.trivia_ledger_raise('invalid_plan_refund', jsonb_build_object('refund', x));
    END IF;
    v_seen := v_seen || v_user; v_refs := v_refs || (x ->> 'reference'); v_ref := v_ref + p.entry_amount;
    IF p.funding_source = 'treasury' THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account', 'treasury:trivia', 'amount', p.entry_amount, 'user_id', v_user,
                   'participant_kind', p.participant_kind, 'memo', 'horse entry returned to treasury (' || (x ->> 'reference') || ')'));
    ELSE
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account', 'wallet:' || v_user::text, 'amount', p.entry_amount, 'user_id', v_user,
                   'participant_kind', p.participant_kind, 'wallet_kind', v_kind, 'wallet_reference', x ->> 'reference',
                   'wallet_description', x ->> 'description', 'mechanism', 'add', 'on_refusal', v_refusal));
    END IF;
  END LOOP;
  IF v_rake > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account', v_rake_account, 'amount', v_rake, 'memo', 'rake'));
  END IF;
  -- conservation: every diamond in escrow is explained exactly once
  IF v_rake + v_pay + v_ref <> v_escrow THEN
    PERFORM public.trivia_ledger_raise('plan_does_not_conserve_escrow',
      jsonb_build_object('escrow', v_escrow, 'rake', v_rake, 'payouts', v_pay, 'refunds', v_ref));
  END IF;
  IF (v_terminal = 'voided' AND (v_escrow <> 0 OR v_pay <> 0 OR v_ref <> 0 OR v_rake <> 0))
     OR (v_terminal = 'refunded' AND (v_pay <> 0 OR v_rake <> 0))
     OR (v_terminal = 'settled' AND v_pay = 0 AND v_rake = 0) THEN
    PERFORM public.trivia_ledger_raise('terminal_state_inconsistent', jsonb_build_object('terminal_state', v_terminal));
  END IF;
  IF v_escrow > 0 THEN
    v_lines := jsonb_build_array(jsonb_build_object('account', s.escrow_account_code, 'amount', -v_escrow, 'memo', 'escrow settled')) || v_lines;
    v_post := public.trivia_ledger_post(
      jsonb_build_object('idempotency_key', s.idempotency_key, 'operation', 'settlement',
        'request', jsonb_build_object('op', 'settlement', 'subject_type', p_subject_type, 'subject_id', p_subject_id, 'plan_hash', v_hash),
        'source_event', p_subject_type || '.settled', 'source_type', p_subject_type, 'source_id', p_subject_id::text,
        'subject_type', p_subject_type, 'subject_id', p_subject_id, 'settlement_id', s.id, 'rules_version_id', s.rules_version_id,
        'actor_kind', 'system', 'funding_source', 'escrow'),
      v_lines);
    v_journal := (v_post ->> 'journal_id')::uuid;
    SELECT COALESCE(jsonb_agg(l), '[]'::jsonb) INTO v_owed FROM jsonb_array_elements(v_post -> 'lines') l WHERE l ->> 'account' LIKE 'liability:%';
  END IF;
  PERFORM set_config('trivia_ledger.writer', 'on', true);
  -- participants: payout/refund/lost, rank and rake share (largest remainder by entry, ties by user id), ONE update each
  SELECT COALESCE(sum(pp.entry_amount), 0) INTO v_settled_entries
    FROM public.trivia_settlement_participants pp
   WHERE pp.settlement_id = s.id AND pp.state = 'held'
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_plan -> 'refunds', '[]'::jsonb)) rf
                      WHERE rf.value ->> 'user_id' = pp.user_id::text);
  v_alloc := s.rake_amount + v_rake;
  WITH cls AS (
    SELECT pp.user_id, pp.entry_amount,
           CASE WHEN rf.value IS NOT NULL THEN 'refund' WHEN po.value IS NOT NULL THEN 'payout' ELSE 'lost' END AS kind,
           COALESCE((po.value ->> 'amount')::bigint, 0) AS amount,
           COALESCE((po.value ->> 'rank')::integer, (rs.value ->> 'rank')::integer) AS rank, rs.value AS res
      FROM public.trivia_settlement_participants pp
      LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(COALESCE(p_plan -> 'payouts', '[]'::jsonb))
                          WHERE value ->> 'user_id' = pp.user_id::text LIMIT 1) po ON true
      LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(COALESCE(p_plan -> 'refunds', '[]'::jsonb))
                          WHERE value ->> 'user_id' = pp.user_id::text LIMIT 1) rf ON true
      LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(COALESCE(p_plan -> 'results', '[]'::jsonb))
                          WHERE value ->> 'user_id' = pp.user_id::text LIMIT 1) rs ON true
     WHERE pp.settlement_id = s.id AND pp.state = 'held'),
  shares AS (
    SELECT c.*,
           CASE WHEN c.kind = 'refund' OR v_settled_entries = 0 THEN NULL ELSE (v_alloc * c.entry_amount) / v_settled_entries END AS base_share,
           CASE WHEN c.kind = 'refund' OR v_settled_entries = 0 THEN NULL ELSE (v_alloc * c.entry_amount) % v_settled_entries END AS rem
      FROM cls c),
  ranked AS (
    SELECT sh.*, row_number() OVER (PARTITION BY (sh.kind = 'refund') ORDER BY sh.rem DESC NULLS LAST, sh.user_id) AS rn,
           v_alloc - COALESCE(sum(sh.base_share) OVER (), 0) AS leftover
      FROM shares sh)
  UPDATE public.trivia_settlement_participants tp
     SET state = CASE WHEN rk.kind = 'refund' THEN 'refunded' ELSE 'settled' END,
         payout_amount = rk.amount,
         refund_amount = CASE WHEN rk.kind = 'refund' THEN tp.entry_amount ELSE 0 END,
         rake_share = CASE WHEN rk.base_share IS NULL THEN NULL ELSE rk.base_share + CASE WHEN rk.rn <= rk.leftover THEN 1 ELSE 0 END END,
         net_contribution = CASE WHEN rk.base_share IS NULL THEN NULL
                                 ELSE tp.entry_amount - (rk.base_share + CASE WHEN rk.rn <= rk.leftover THEN 1 ELSE 0 END) END,
         final_rank = rk.rank, result = rk.res, exit_journal_id = v_journal
    FROM ranked rk
   WHERE tp.settlement_id = s.id AND tp.user_id = rk.user_id;
  -- escrow must be exactly zero and is closed for good
  UPDATE public.trivia_ledger_accounts SET state = 'closed', closed_at = clock_timestamp(), closed_by_journal_id = v_journal
   WHERE account_code = s.escrow_account_code AND balance = 0 AND state = 'open';
  IF NOT FOUND THEN
    PERFORM public.trivia_ledger_raise('escrow_not_zero_at_terminal', jsonb_build_object('escrow_account', s.escrow_account_code));
  END IF;
  v_result := jsonb_build_object('success', true, 'replayed', false, 'settlement_id', s.id, 'subject_type', p_subject_type,
    'subject_id', p_subject_id, 'idempotency_key', s.idempotency_key, 'journal_id', v_journal, 'state', v_terminal,
    'outcome', v_outcome, 'gross_pool', s.gross_pool, 'subsidy_total', s.subsidy_total, 'rake', s.rake_amount + v_rake,
    'final_prize_pool', v_pay, 'paid_total', v_pay, 'refunded_total', s.refunded_total + v_ref, 'escrow_balance', 0,
    'owed', v_owed, 'lines', COALESCE(v_post -> 'lines', '[]'::jsonb));
  UPDATE public.trivia_settlements
     SET state = v_terminal, outcome = v_outcome, rake_amount = rake_amount + v_rake, paid_total = v_pay,
         refunded_total = refunded_total + v_ref, final_prize_pool = v_pay, plan = p_plan, plan_hash = v_hash,
         result = v_result, settlement_journal_id = v_journal, terminal_at = clock_timestamp()
   WHERE id = s.id;
  INSERT INTO public.trivia_settlement_events (settlement_id, event, from_state, to_state, detail)
  VALUES (s.id, 'settle', 'locked', v_terminal, jsonb_build_object('outcome', v_outcome, 'journal_id', v_journal,
          'rake', v_rake, 'paid', v_pay, 'refunded', v_ref, 'owed', jsonb_array_length(v_owed)));
  PERFORM set_config('trivia_ledger.writer', '', true);
  RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.trivia_settlement_status(p_subject_type text, p_subject_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT CASE WHEN s.id IS NULL THEN jsonb_build_object('success', false, 'error', 'settlement_not_found')
         ELSE jsonb_build_object('success', true, 'settlement_id', s.id, 'state', s.state, 'outcome', s.outcome,
           'rules_version_id', s.rules_version_id, 'idempotency_key', s.idempotency_key, 'gross_pool', s.gross_pool,
           'held_total', s.held_total, 'subsidy_total', s.subsidy_total, 'released_total', s.released_total,
           'refunded_total', s.refunded_total, 'rake', s.rake_amount, 'final_prize_pool', s.final_prize_pool,
           'paid_total', s.paid_total, 'escrow_balance', a.balance, 'escrow_state', a.state,
           'opened_at', s.opened_at, 'locked_at', s.locked_at, 'terminal_at', s.terminal_at,
           'participants', (SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'participant_kind', p.participant_kind,
               'funding_source', p.funding_source, 'entry_amount', p.entry_amount, 'state', p.state, 'rake_share', p.rake_share,
               'net_contribution', p.net_contribution, 'payout_amount', p.payout_amount, 'refund_amount', p.refund_amount,
               'final_rank', p.final_rank, 'hold_reference', p.hold_reference) ORDER BY p.created_at, p.user_id), '[]'::jsonb)
             FROM public.trivia_settlement_participants p WHERE p.settlement_id = s.id)) END
    FROM (SELECT 1) one
    LEFT JOIN public.trivia_settlements s ON s.subject_type = p_subject_type AND s.subject_id = p_subject_id
    LEFT JOIN public.trivia_ledger_accounts a ON a.account_code = s.escrow_account_code;
$fn$;

-- ---------------------------------------------------------------------------------------------
-- 9. Owner-only operator operations (approval record required; not granted to any API role)
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_ledger_reverse(p_idempotency_key text, p_journal_id uuid, p_approval jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_req jsonb; v_pre jsonb; j public.trivia_ledger_journals%ROWTYPE; v_lines jsonb := '[]'::jsonb; l record; v_detail text;
BEGIN
  v_req := jsonb_build_object('op', 'reversal', 'journal_id', p_journal_id);
  BEGIN
    v_pre := public.trivia_ledger_begin(p_idempotency_key, 'reversal', v_req);
    IF v_pre IS NOT NULL THEN RETURN v_pre; END IF;
    SELECT * INTO j FROM public.trivia_ledger_journals WHERE id = p_journal_id;
    IF NOT FOUND OR j.operation NOT IN ('debit', 'payout', 'rake', 'treasury_fund', 'repair')
       OR EXISTS (SELECT 1 FROM public.trivia_ledger_journals r WHERE r.reverses_journal_id = p_journal_id) THEN
      PERFORM public.trivia_ledger_raise('journal_not_reversible', jsonb_build_object('journal_id', p_journal_id, 'operation', j.operation));
    END IF;
    FOR l IN SELECT * FROM public.trivia_ledger_lines WHERE journal_id = p_journal_id ORDER BY line_no LOOP
      IF l.account_kind = 'player_wallet' THEN
        v_lines := v_lines || jsonb_build_array(jsonb_build_object('account', l.account_code, 'amount', -l.amount, 'user_id', l.user_id,
          'participant_kind', l.participant_kind, 'mechanism', 'add', 'wallet_reference', 'trivia_reversal:' || l.wallet_reference,
          'wallet_kind', CASE WHEN l.amount > 0 THEN 'adjustment'
                              WHEN l.wallet_kind = 'pvp_stake' THEN 'pvp_refund'
                              WHEN l.wallet_kind = 'tournament_entry' THEN 'tournament_entry_refund' ELSE 'refund' END,
          'wallet_description', 'Reversal of ' || l.wallet_reference));
      ELSE
        v_lines := v_lines || jsonb_build_array(jsonb_build_object('account', l.account_code, 'amount', -l.amount, 'user_id', l.user_id,
          'participant_kind', l.participant_kind, 'memo', 'reversal of line ' || l.line_no));
      END IF;
    END LOOP;
    RETURN public.trivia_ledger_post(
      jsonb_build_object('idempotency_key', p_idempotency_key, 'operation', 'reversal', 'request', v_req,
        'source_event', 'ledger.reversal', 'source_type', j.source_type, 'source_id', j.source_id, 'subject_type', j.subject_type,
        'subject_id', j.subject_id, 'settlement_id', j.settlement_id, 'rules_version_id', j.rules_version_id,
        'actor_kind', 'operator', 'funding_source', 'mixed', 'reverses_journal_id', p_journal_id, 'approval', p_approval),
      v_lines);
  EXCEPTION
    WHEN SQLSTATE 'TL001' THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
      RETURN public.trivia_ledger_error(SQLERRM, v_detail, p_idempotency_key, 'reversal');
    WHEN OTHERS THEN
      RETURN public.trivia_ledger_unexpected(SQLSTATE, SQLERRM, p_idempotency_key, 'reversal');
  END;
END $fn$;

-- p_lines: [{account, amount, user_id?, wallet_kind?, wallet_reference?, description?}]; escrow accounts
-- of terminal settlements are closed and cannot be touched.
CREATE OR REPLACE FUNCTION public.trivia_ledger_repair(p_idempotency_key text, p_lines jsonb, p_approval jsonb, p_context jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_req jsonb; v_pre jsonb; v_lines jsonb := '[]'::jsonb; x jsonb; v_detail text;
BEGIN
  v_req := jsonb_build_object('op', 'repair', 'lines', p_lines);
  BEGIN
    v_pre := public.trivia_ledger_begin(p_idempotency_key, 'repair', v_req);
    IF v_pre IS NOT NULL THEN RETURN v_pre; END IF;
    IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN
      PERFORM public.trivia_ledger_raise('invalid_lines');
    END IF;
    FOR x IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
      IF (x ->> 'account') LIKE 'wallet:%' THEN
        IF NOT ((x ->> 'amount')::bigint > 0 AND x ->> 'wallet_kind' IN ('trivia_run', 'trivia_daily_bonus', 'trivia_prize_wheel', 'pvp_win',
                   'pvp_refund', 'tournament_prize', 'tournament_entry_refund', 'tournament_cancel_refund', 'refund'))
           AND NOT ((x ->> 'amount')::bigint < 0 AND x ->> 'wallet_kind' IN ('adjustment', 'trivia_entry', 'pvp_stake', 'tournament_entry')) THEN
          PERFORM public.trivia_ledger_raise('invalid_wallet_kind', x);
        END IF;
        v_lines := v_lines || jsonb_build_array(x || jsonb_build_object('user_id', substr(x ->> 'account', 8), 'mechanism', 'add',
                                                                           'wallet_description', COALESCE(x ->> 'description', 'Trivia ledger repair')));
      ELSE
        v_lines := v_lines || jsonb_build_array(jsonb_build_object('account', x ->> 'account', 'amount', (x ->> 'amount')::bigint,
                                                                   'user_id', x ->> 'user_id', 'memo', COALESCE(x ->> 'description', 'repair')));
      END IF;
    END LOOP;
    RETURN public.trivia_ledger_post(
      jsonb_build_object('idempotency_key', p_idempotency_key, 'operation', 'repair', 'request', v_req,
        'source_event', 'ledger.repair', 'source_type', p_context ->> 'source_type', 'source_id', p_context ->> 'source_id',
        'actor_kind', 'operator', 'funding_source', 'mixed', 'approval', p_approval),
      v_lines);
  EXCEPTION
    WHEN SQLSTATE 'TL001' THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
      RETURN public.trivia_ledger_error(SQLERRM, v_detail, p_idempotency_key, 'repair');
    WHEN OTHERS THEN
      RETURN public.trivia_ledger_unexpected(SQLSTATE, SQLERRM, p_idempotency_key, 'repair');
  END;
END $fn$;

CREATE OR REPLACE FUNCTION public.trivia_ledger_treasury_fund(p_idempotency_key text, p_amount integer, p_source text,
  p_approval jsonb, p_house_account text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_req jsonb; v_pre jsonb; v_from text; v_detail text;
BEGIN
  v_req := jsonb_build_object('op', 'treasury_fund', 'amount', p_amount, 'source', p_source, 'house_account', p_house_account);
  BEGIN
    v_pre := public.trivia_ledger_begin(p_idempotency_key, 'treasury_fund', v_req);
    IF v_pre IS NOT NULL THEN RETURN v_pre; END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
      PERFORM public.trivia_ledger_raise('invalid_request', jsonb_build_object('amount', p_amount));
    END IF;
    v_from := CASE WHEN p_source = 'platform_issuance' THEN 'issuance:treasury_funding'
                   WHEN p_source = 'house_revenue' AND p_house_account LIKE 'house:%' THEN p_house_account END;
    IF v_from IS NULL THEN
      PERFORM public.trivia_ledger_raise('invalid_funding', jsonb_build_object('source', p_source, 'house_account', p_house_account));
    END IF;
    RETURN public.trivia_ledger_post(
      jsonb_build_object('idempotency_key', p_idempotency_key, 'operation', 'treasury_fund', 'request', v_req,
        'source_event', 'treasury.funded', 'source_type', 'treasury', 'source_id', 'treasury:trivia', 'actor_kind', 'operator',
        'funding_source', CASE WHEN p_source = 'platform_issuance' THEN 'platform_issuance' ELSE 'house_revenue' END,
        'approval', p_approval),
      jsonb_build_array(jsonb_build_object('account', v_from, 'amount', -p_amount, 'memo', 'treasury funding'),
                        jsonb_build_object('account', 'treasury:trivia', 'amount', p_amount, 'memo', 'treasury funding')));
  EXCEPTION
    WHEN SQLSTATE 'TL001' THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
      RETURN public.trivia_ledger_error(SQLERRM, v_detail, p_idempotency_key, 'treasury_fund');
    WHEN OTHERS THEN
      RETURN public.trivia_ledger_unexpected(SQLSTATE, SQLERRM, p_idempotency_key, 'treasury_fund');
  END;
END $fn$;

CREATE OR REPLACE FUNCTION public.trivia_ledger_set_switch(p_key text, p_enabled boolean, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  IF length(btrim(COALESCE(p_reason, ''))) = 0 OR p_enabled IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'reason_required');
  END IF;
  UPDATE public.trivia_ledger_switches SET enabled = p_enabled, reason = p_reason WHERE key = p_key;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'unknown_switch'); END IF;
  RETURN jsonb_build_object('success', true, 'key', p_key, 'enabled', p_enabled);
END $fn$;

CREATE OR REPLACE FUNCTION public.trivia_ledger_set_config(p_key text, p_value bigint, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  IF length(btrim(COALESCE(p_reason, ''))) = 0 OR p_value IS NULL OR p_value < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_request');
  END IF;
  UPDATE public.trivia_ledger_config SET value = p_value, reason = p_reason WHERE key = p_key;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'unknown_config_key'); END IF;
  RETURN jsonb_build_object('success', true, 'key', p_key, 'value', p_value);
END $fn$;

CREATE OR REPLACE FUNCTION public.trivia_rules_set_current(p_rules_key text, p_rules_version_id text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  IF length(btrim(COALESCE(p_reason, ''))) = 0 THEN RETURN jsonb_build_object('success', false, 'error', 'reason_required'); END IF;
  UPDATE public.trivia_rules_current SET rules_version_id = p_rules_version_id, reason = p_reason, updated_at = now()
   WHERE rules_key = p_rules_key;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'unknown_rules_key'); END IF;
  RETURN jsonb_build_object('success', true, 'rules_key', p_rules_key, 'rules_version_id', p_rules_version_id);
END $fn$;

-- ---------------------------------------------------------------------------------------------
-- 10. Rules reads
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_rules_get(p_rules_version_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT jsonb_build_object('id', v.id, 'rules_key', v.rules_key, 'version', v.version, 'family', v.family, 'mode', v.mode,
                            'provisional', v.provisional, 'approval_source', v.approval_source, 'sha256', v.rules_sha256, 'rules', v.rules)
    FROM public.trivia_rules_versions v WHERE v.id = p_rules_version_id;
$fn$;

CREATE OR REPLACE FUNCTION public.trivia_rules_current(p_rules_key text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT public.trivia_rules_get(c.rules_version_id) FROM public.trivia_rules_current c WHERE c.rules_key = p_rules_key;
$fn$;

CREATE OR REPLACE FUNCTION public.trivia_rules_key_for_mode(p_mode text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $fn$
  SELECT CASE WHEN p_mode = 'pvp' THEN 'pvp.standard' WHEN p_mode = 'tournaments' THEN 'tournament.nightly'
              WHEN p_mode IS NULL THEN NULL ELSE 'solo.' || p_mode END;
$fn$;

CREATE OR REPLACE FUNCTION public.trivia_rules_pvp_money(p_rules_version_id text, p_stake integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT CASE WHEN v.rules -> 'stakes' @> to_jsonb(p_stake)
    THEN jsonb_build_object('stake', p_stake, 'pot', p_stake * 2,
           'rake', ((p_stake * 2) * (v.rules -> 'rake' ->> 'numerator')::integer) / (v.rules -> 'rake' ->> 'denominator')::integer,
           'winner_payout', (p_stake * 2) - ((p_stake * 2) * (v.rules -> 'rake' ->> 'numerator')::integer) / (v.rules -> 'rake' ->> 'denominator')::integer)
    ELSE jsonb_build_object('error', 'stake_not_allowed') END
    FROM public.trivia_rules_versions v WHERE v.id = p_rules_version_id AND v.family = 'pvp';
$fn$;

CREATE OR REPLACE FUNCTION public.trivia_rules_tournament_prizes(p_rules_version_id text, p_prize_pool bigint, p_finishers jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_rules jsonb; t jsonb; v_members jsonb; v_each bigint; v_paid bigint := 0; v_out jsonb := '[]'::jsonb; v_total bigint;
BEGIN
  SELECT rules INTO v_rules FROM public.trivia_rules_versions WHERE id = p_rules_version_id AND family = 'tournament';
  IF v_rules IS NULL THEN RETURN jsonb_build_object('error', 'invalid_rules_version'); END IF;
  v_total := GREATEST(COALESCE(p_prize_pool, 0), 0);
  FOR t IN SELECT value FROM jsonb_array_elements(v_rules -> 'prizes' -> 'tiers') LOOP
    SELECT COALESCE(jsonb_agg(f.value ORDER BY f.ord), '[]'::jsonb) INTO v_members
      FROM (SELECT value, ord FROM jsonb_array_elements(COALESCE(p_finishers, '[]'::jsonb)) WITH ORDINALITY AS e(value, ord)
             WHERE (value ->> 'finish_tier')::integer = (t ->> 'finish_tier')::integer
             ORDER BY ord LIMIT (t ->> 'places')::integer) f;
    IF jsonb_array_length(v_members) > 0 THEN
      v_each := ((v_total * (t ->> 'bp')::bigint) / 10000) / jsonb_array_length(v_members);
      SELECT v_out || COALESCE(jsonb_agg(jsonb_build_object('user_id', m ->> 'user_id', 'finish_tier', (t ->> 'finish_tier')::integer,
                                                            'amount', v_each)), '[]'::jsonb)
        INTO v_out FROM jsonb_array_elements(v_members) m;
      v_paid := v_paid + v_each * jsonb_array_length(v_members);
    END IF;
  END LOOP;
  SELECT COALESCE(jsonb_agg(CASE WHEN e.ord = (SELECT min(o2.ord) FROM jsonb_array_elements(v_out) WITH ORDINALITY o2(value, ord)
                                                 WHERE (o2.value ->> 'finish_tier')::integer = 1)
                                 THEN e.value || jsonb_build_object('amount', (e.value ->> 'amount')::bigint + (v_total - v_paid))
                                 ELSE e.value END ORDER BY e.ord) FILTER (WHERE true), '[]'::jsonb)
    INTO v_out FROM jsonb_array_elements(v_out) WITH ORDINALITY e(value, ord);
  RETURN (SELECT COALESCE(jsonb_agg(value), '[]'::jsonb) FROM jsonb_array_elements(v_out) WHERE (value ->> 'amount')::bigint > 0);
END $fn$;

-- ---------------------------------------------------------------------------------------------
-- 11. Reconciliation (service_role read only)
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_ledger_epoch()
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT min(created_at) FROM public.trivia_rules_versions;
$fn$;

CREATE OR REPLACE FUNCTION public.trivia_ledger_switch_at(p_key text, p_at timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT COALESCE((SELECT h.enabled FROM public.trivia_ledger_switch_history h
                    WHERE h.key = p_key AND h.changed_at <= p_at ORDER BY h.changed_at DESC, h.id DESC LIMIT 1), false);
$fn$;

-- Which platform journal rows belong to trivia (NULL = not trivia).
CREATE OR REPLACE FUNCTION public.trivia_ledger_platform_family(p_kind text, p_reference text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $fn$
  SELECT CASE
    WHEN p_kind IN ('pvp_stake', 'pvp_win', 'pvp_refund', 'pvp_tie_refund')
      OR p_reference LIKE 'pvp\_%' OR p_reference LIKE 'legacy\_pvp\_%' THEN 'pvp'
    WHEN p_kind IN ('tournament_entry', 'tournament_entry_refund', 'tournament_cancel_refund', 'tournament_prize')
      OR p_reference LIKE 'trivia\_tourn\_%' THEN 'tournament'
    WHEN p_kind IN ('trivia_entry', 'trivia_run', 'trivia_daily_bonus', 'trivia_prize_wheel', 'trivia_lifeline', 'trivia_arcade')
      OR p_reference LIKE 'trivia\_%' OR p_reference LIKE 'spend:%:trivia\_lifeline:%' THEN 'solo'
  END;
$fn$;

CREATE OR REPLACE VIEW public.trivia_ledger_account_balances WITH (security_invoker = true) AS
SELECT a.account_code, a.kind, a.user_id, a.subject_id, a.state, a.tracks_balance, a.min_balance,
       a.balance AS cached_balance, COALESCE(l.total, 0) AS journal_balance, COALESCE(l.n, 0) AS line_count,
       CASE WHEN a.tracks_balance THEN a.balance - COALESCE(l.total, 0) ELSE 0 END AS drift
  FROM public.trivia_ledger_accounts a
  LEFT JOIN (SELECT account_code, sum(amount) AS total, count(*) AS n FROM public.trivia_ledger_lines GROUP BY account_code) l
    ON l.account_code = a.account_code;

CREATE OR REPLACE VIEW public.trivia_ledger_recon_reference WITH (security_invoker = true) AS
SELECT 'journal'::text AS origin, j.id AS journal_id, j.idempotency_key, j.operation, l.line_no, l.user_id,
       l.wallet_reference AS reference, l.wallet_kind AS kind, l.amount, l.diamond_transaction_id,
       COALESCE(d.amount, ar.amount)::bigint AS platform_amount, COALESCE(d.created_at, ar.created_at, l.created_at) AS created_at,
       CASE WHEN d.id IS NULL AND ar.id IS NULL THEN 'missing_platform_row'
            WHEN COALESCE(d.user_id, ar.user_id) IS DISTINCT FROM l.user_id THEN 'user_mismatch'
            WHEN COALESCE(d.amount, ar.amount)::bigint IS DISTINCT FROM l.amount THEN 'amount_mismatch'
            WHEN COALESCE(NULLIF(btrim(COALESCE(d.transaction_type, ar.transaction_type)), ''), d.type, ar.type) IS DISTINCT FROM l.wallet_kind THEN 'kind_mismatch'
            WHEN l.reconciliation_state = 'linked' AND COALESCE(d.reference_id, ar.reference_id) IS DISTINCT FROM l.wallet_reference THEN 'reference_mismatch'
            WHEN d.id IS NULL THEN 'reconciled_archived'
            ELSE 'reconciled' END AS state
  FROM public.trivia_ledger_lines l
  JOIN public.trivia_ledger_journals j ON j.id = l.journal_id
  LEFT JOIN public.diamond_transactions d ON d.id = l.diamond_transaction_id
  LEFT JOIN public.ca_diamond_journal_archive ar ON ar.id = l.diamond_transaction_id
 WHERE l.account_kind = 'player_wallet'
UNION ALL
SELECT 'platform', NULL, NULL, NULL, NULL, d.user_id, d.reference_id, COALESCE(NULLIF(btrim(d.transaction_type), ''), d.type),
       d.amount::bigint, d.id, d.amount::bigint, d.created_at,
       CASE WHEN d.created_at < public.trivia_ledger_epoch() THEN 'legacy_pending_backfill'
            WHEN public.trivia_ledger_platform_family(COALESCE(NULLIF(btrim(d.transaction_type), ''), d.type), d.reference_id) = 'solo'
                 AND NOT public.trivia_ledger_switch_at('solo_journal', d.created_at) THEN 'legacy_path_switch_off'
            ELSE 'unjournaled_unexplained' END
  FROM public.diamond_transactions d
 WHERE public.trivia_ledger_platform_family(COALESCE(NULLIF(btrim(d.transaction_type), ''), d.type), d.reference_id) IS NOT NULL
   AND d.amount <> 0
   AND NOT EXISTS (SELECT 1 FROM public.trivia_ledger_lines l WHERE l.diamond_transaction_id = d.id);

CREATE OR REPLACE VIEW public.trivia_ledger_recon_settlement WITH (security_invoker = true) AS
SELECT s.id AS settlement_id, s.subject_type, s.subject_id, s.state, s.outcome, s.rules_version_id, s.idempotency_key,
       s.gross_pool, s.held_total, s.subsidy_total, s.released_total, s.refunded_total, s.rake_amount, s.final_prize_pool,
       s.paid_total, a.balance AS escrow_cached_balance, COALESCE(jl.total, 0) AS escrow_journal_balance, a.state AS escrow_state,
       (s.state IN ('settled', 'refunded', 'voided')) AS terminal,
       s.held_total - s.released_total - s.refunded_total - s.rake_amount - s.paid_total AS expected_escrow,
       (s.held_total - s.released_total - s.refunded_total - s.rake_amount - s.paid_total) - COALESCE(jl.total, 0) AS unexplained_variance,
       (s.state IN ('settled', 'refunded', 'voided') AND (a.balance <> 0 OR a.state <> 'closed' OR COALESCE(jl.total, 0) <> 0)) AS nonzero_terminal_escrow,
       (SELECT count(*) FROM public.trivia_settlement_participants p WHERE p.settlement_id = s.id) AS participants,
       (SELECT count(*) FROM public.trivia_settlement_participants p WHERE p.settlement_id = s.id AND p.participant_kind = 'horse') AS horse_participants,
       s.opened_at, s.locked_at, s.terminal_at,
       EXTRACT(epoch FROM (s.terminal_at - s.locked_at))::numeric AS settlement_seconds
  FROM public.trivia_settlements s
  JOIN public.trivia_ledger_accounts a ON a.account_code = s.escrow_account_code
  LEFT JOIN (SELECT account_code, sum(amount) AS total FROM public.trivia_ledger_lines GROUP BY account_code) jl
    ON jl.account_code = s.escrow_account_code;

CREATE OR REPLACE VIEW public.trivia_ledger_recon_match WITH (security_invoker = true) AS
SELECT * FROM public.trivia_ledger_recon_settlement WHERE subject_type = 'pvp_match';

CREATE OR REPLACE VIEW public.trivia_ledger_recon_tournament WITH (security_invoker = true) AS
SELECT * FROM public.trivia_ledger_recon_settlement WHERE subject_type = 'tournament';

CREATE OR REPLACE VIEW public.trivia_ledger_recon_user WITH (security_invoker = true) AS
SELECT l.user_id, count(*) AS wallet_lines, sum(l.amount) AS journal_net,
       sum(COALESCE(d.amount, ar.amount, 0))::bigint AS platform_net,
       sum(l.amount) - sum(COALESCE(d.amount, ar.amount, 0))::bigint AS unexplained_variance,
       count(*) FILTER (WHERE d.id IS NULL AND ar.id IS NULL) AS missing_platform_rows,
       COALESCE((SELECT sum(la.balance) FROM public.trivia_ledger_accounts la
                  WHERE la.kind = 'refund_liability' AND la.user_id = l.user_id), 0) AS owed_liability
  FROM public.trivia_ledger_lines l
  LEFT JOIN public.diamond_transactions d ON d.id = l.diamond_transaction_id
  LEFT JOIN public.ca_diamond_journal_archive ar ON ar.id = l.diamond_transaction_id
 WHERE l.account_kind = 'player_wallet'
 GROUP BY l.user_id;

CREATE OR REPLACE VIEW public.trivia_ledger_recon_treasury WITH (security_invoker = true) AS
SELECT a.balance AS treasury_balance, COALESCE(jl.total, 0) AS journal_balance, a.balance - COALESCE(jl.total, 0) AS drift,
       public.trivia_ledger_config_value('treasury_floor') AS floor,
       public.trivia_ledger_config_value('treasury_warning_level') AS warning_level,
       public.trivia_ledger_config_value('treasury_daily_subsidy_ceiling') AS daily_ceiling,
       public.trivia_ledger_config_value('treasury_exposure_ceiling') AS exposure_ceiling,
       COALESCE((SELECT sum(-l.amount) FROM public.trivia_ledger_lines l WHERE l.account_code = 'treasury:trivia' AND l.amount < 0
                   AND l.created_at >= (date_trunc('day', now() AT TIME ZONE 'America/Chicago')) AT TIME ZONE 'America/Chicago'), 0) AS outflow_today,
       COALESCE((SELECT sum(p.entry_amount) FROM public.trivia_settlement_participants p JOIN public.trivia_settlements s ON s.id = p.settlement_id
                  WHERE p.funding_source = 'treasury' AND p.state = 'held' AND s.state IN ('open', 'locked')), 0) AS open_exposure,
       COALESCE((SELECT sum(l.amount) FROM public.trivia_ledger_lines l JOIN public.trivia_ledger_journals j ON j.id = l.journal_id
                  WHERE l.account_code = 'treasury:trivia' AND j.operation = 'treasury_fund'), 0) AS lifetime_funded,
       COALESCE((SELECT sum(-l.amount) FROM public.trivia_ledger_lines l WHERE l.account_code = 'treasury:trivia' AND l.amount < 0), 0) AS lifetime_outflow,
       COALESCE((SELECT sum(l.amount) FROM public.trivia_ledger_lines l JOIN public.trivia_ledger_journals j ON j.id = l.journal_id
                  WHERE l.account_code = 'treasury:trivia' AND l.amount > 0 AND j.operation <> 'treasury_fund'), 0) AS lifetime_returned
  FROM (SELECT 1) one
  LEFT JOIN public.trivia_ledger_accounts a ON a.account_code = 'treasury:trivia'
  LEFT JOIN (SELECT sum(amount) AS total FROM public.trivia_ledger_lines WHERE account_code = 'treasury:trivia') jl ON true;

CREATE OR REPLACE VIEW public.trivia_ledger_recon_date WITH (security_invoker = true) AS
SELECT (l.created_at AT TIME ZONE 'America/Chicago')::date AS chicago_date,
       count(DISTINCT l.journal_id) AS journals, count(*) AS lines, sum(l.amount) AS imbalance,
       COALESCE(sum(-l.amount) FILTER (WHERE l.account_kind = 'player_wallet' AND l.amount < 0), 0) AS wallet_debits,
       COALESCE(sum(l.amount) FILTER (WHERE l.account_kind = 'player_wallet' AND l.amount > 0), 0) AS wallet_credits,
       COALESCE(sum(l.amount) FILTER (WHERE l.account_kind = 'player_wallet'), 0) AS wallet_net,
       COALESCE(sum(COALESCE(d.amount, ar.amount)) FILTER (WHERE l.account_kind = 'player_wallet'), 0)::bigint AS platform_net,
       COALESCE(sum(l.amount) FILTER (WHERE l.account_kind = 'player_wallet'), 0)
         - COALESCE(sum(COALESCE(d.amount, ar.amount)) FILTER (WHERE l.account_kind = 'player_wallet'), 0)::bigint AS unexplained_variance
  FROM public.trivia_ledger_lines l
  LEFT JOIN public.diamond_transactions d ON d.id = l.diamond_transaction_id
  LEFT JOIN public.ca_diamond_journal_archive ar ON ar.id = l.diamond_transaction_id
 GROUP BY 1;

-- ---------------------------------------------------------------------------------------------
-- 12. Ledger health (metrics + alert findings), called by /api/cron/trivia-economy-audit
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_ledger_health_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_epoch timestamptz := public.trivia_ledger_epoch();
  v_global numeric; v_unbalanced integer; v_drift integer; v_refvar integer; v_unexplained integer; v_legacy_path integer;
  v_pending integer; v_nonzero integer; v_variance integer; v_treasury bigint; v_floor bigint; v_warn bigint; v_stuck integer;
  v_replays integer; v_conflicts integer; v_p50 numeric; v_p95 numeric; v_open integer; v_total integer; v_findings jsonb;
  v_metrics jsonb; v_run uuid;
BEGIN
  SELECT COALESCE(sum(amount), 0) INTO v_global FROM public.trivia_ledger_lines;
  SELECT count(*) INTO v_unbalanced FROM (
    SELECT l.journal_id FROM public.trivia_ledger_lines l JOIN public.trivia_ledger_journals j ON j.id = l.journal_id
     WHERE j.created_at >= now() - interval '30 days'
     GROUP BY l.journal_id, j.line_count HAVING sum(l.amount) <> 0 OR count(*) <> j.line_count) x;
  SELECT count(*) INTO v_drift FROM public.trivia_ledger_account_balances WHERE drift <> 0;
  SELECT count(*) INTO v_refvar FROM public.trivia_ledger_recon_reference
   WHERE origin = 'journal' AND state NOT IN ('reconciled', 'reconciled_archived');
  SELECT count(*) FILTER (WHERE fam = 'solo' AND NOT public.trivia_ledger_switch_at('solo_journal', created_at)),
         count(*) FILTER (WHERE NOT (fam = 'solo' AND NOT public.trivia_ledger_switch_at('solo_journal', created_at)))
    INTO v_legacy_path, v_unexplained
    FROM (SELECT d.created_at,
                 public.trivia_ledger_platform_family(COALESCE(NULLIF(btrim(d.transaction_type), ''), d.type), d.reference_id) AS fam
            FROM public.diamond_transactions d
           WHERE d.created_at >= v_epoch AND d.amount <> 0
             AND NOT EXISTS (SELECT 1 FROM public.trivia_ledger_lines l WHERE l.diamond_transaction_id = d.id)) x
   WHERE fam IS NOT NULL;
  SELECT count(*) INTO v_pending FROM public.diamond_transactions d
   WHERE d.created_at < v_epoch AND d.amount <> 0
     AND public.trivia_ledger_platform_family(COALESCE(NULLIF(btrim(d.transaction_type), ''), d.type), d.reference_id) IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.trivia_ledger_lines l WHERE l.diamond_transaction_id = d.id);
  SELECT count(*) FILTER (WHERE nonzero_terminal_escrow), count(*) FILTER (WHERE unexplained_variance <> 0),
         count(*) FILTER (WHERE NOT terminal)
    INTO v_nonzero, v_variance, v_open FROM public.trivia_ledger_recon_settlement;
  SELECT count(*) INTO v_stuck FROM public.trivia_settlements s
   WHERE s.state = 'locked' AND s.locked_at < now() - make_interval(secs => public.trivia_ledger_config_value(
           CASE WHEN s.subject_type = 'pvp_match' THEN 'pvp_settlement_slo_seconds' ELSE 'tournament_settlement_slo_seconds' END));
  SELECT COALESCE(balance, 0) INTO v_treasury FROM public.trivia_ledger_accounts WHERE account_code = 'treasury:trivia';
  v_treasury := COALESCE(v_treasury, 0);
  v_floor := public.trivia_ledger_config_value('treasury_floor');
  v_warn := public.trivia_ledger_config_value('treasury_warning_level');
  SELECT count(*) FILTER (WHERE outcome = 'replayed'), count(*) FILTER (WHERE outcome = 'conflict')
    INTO v_replays, v_conflicts FROM public.trivia_ledger_idempotency_events WHERE at >= now() - interval '24 hours';
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY settlement_seconds), percentile_cont(0.95) WITHIN GROUP (ORDER BY settlement_seconds)
    INTO v_p50, v_p95 FROM public.trivia_ledger_recon_settlement WHERE terminal_at >= now() - interval '7 days' AND settlement_seconds IS NOT NULL;
  v_findings := jsonb_build_object(
    'ledger_imbalance_global', v_global, 'unbalanced_journals_30d', v_unbalanced, 'account_balance_drift', v_drift,
    'wallet_reference_variance', v_refvar, 'unjournaled_unexplained', v_unexplained,
    'nonzero_terminal_escrow', v_nonzero, 'settlement_unexplained_variance', v_variance,
    'treasury_below_floor', (v_treasury < v_floor), 'settlements_past_slo', v_stuck, 'idempotency_conflicts_24h', v_conflicts);
  v_total := (CASE WHEN v_global <> 0 THEN 1 ELSE 0 END) + v_unbalanced + v_drift + v_refvar + v_unexplained + v_nonzero
             + v_variance + (CASE WHEN v_treasury < v_floor THEN 1 ELSE 0 END) + v_stuck + v_conflicts;
  v_metrics := jsonb_build_object(
    'duplicate_prevented_24h', v_replays, 'treasury_balance', v_treasury, 'treasury_floor', v_floor,
    'treasury_below_warning', (v_treasury < v_warn), 'open_settlements', v_open,
    'settlement_latency_p50_seconds_7d', v_p50, 'settlement_latency_p95_seconds_7d', v_p95,
    'legacy_path_rows_switch_off', v_legacy_path, 'legacy_rows_pending_backfill', v_pending,
    'journals_total', (SELECT count(*) FROM public.trivia_ledger_journals),
    'solo_journal_switch', public.trivia_ledger_switch_enabled('solo_journal'));
  INSERT INTO public.trivia_ledger_health_runs (healthy, exception_count, findings, metrics)
  VALUES (v_total = 0, v_total, v_findings, v_metrics) RETURNING id INTO v_run;
  RETURN jsonb_build_object('success', true, 'healthy', v_total = 0, 'run_id', v_run, 'exception_count', v_total,
                            'findings', v_findings, 'metrics', v_metrics);
END $fn$;

-- ---------------------------------------------------------------------------------------------
-- 13. Legacy backfill (owner only): links pre-journal trivia rows, and solo rows written while the
--     solo switch was off, to a balanced journal against suspense:legacy. Moves no diamonds.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_ledger_backfill_legacy(p_limit integer DEFAULT 1000)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE r record; v_epoch timestamptz := public.trivia_ledger_epoch(); v_n integer := 0; v_skipped integer := 0; v_req jsonb; v_pre jsonb;
BEGIN
  FOR r IN
    SELECT d.id, d.user_id, d.amount, d.reference_id, d.created_at, x.kind, x.fam
      FROM public.diamond_transactions d
      CROSS JOIN LATERAL (SELECT COALESCE(NULLIF(btrim(d.transaction_type), ''), d.type) AS kind) k
      CROSS JOIN LATERAL (SELECT k.kind, public.trivia_ledger_platform_family(k.kind, d.reference_id) AS fam) x
     WHERE x.fam IS NOT NULL AND d.amount <> 0
       AND NOT EXISTS (SELECT 1 FROM public.trivia_ledger_lines l WHERE l.diamond_transaction_id = d.id)
       AND (d.created_at < v_epoch OR (x.fam = 'solo' AND NOT public.trivia_ledger_switch_at('solo_journal', d.created_at)))
     ORDER BY d.created_at, d.id
     LIMIT GREATEST(COALESCE(p_limit, 0), 0)
  LOOP
    v_req := jsonb_build_object('op', 'backfill', 'diamond_transaction_id', r.id, 'user_id', r.user_id, 'amount', r.amount, 'kind', r.kind);
    v_pre := public.trivia_ledger_begin('backfill:' || r.id::text, 'backfill', v_req);
    IF v_pre IS NOT NULL THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
    PERFORM public.trivia_ledger_post(
      jsonb_build_object('idempotency_key', 'backfill:' || r.id::text, 'operation', 'backfill', 'request', v_req,
        'source_event', 'legacy.' || r.fam, 'source_type', 'diamond_transaction', 'source_id', r.id::text,
        'actor_kind', 'system', 'funding_source', 'legacy'),
      jsonb_build_array(
        jsonb_build_object('account', 'wallet:' || r.user_id::text, 'amount', r.amount, 'user_id', r.user_id, 'wallet_kind', r.kind,
                           'wallet_reference', r.reference_id, 'mechanism', 'link', 'link_tx_id', r.id,
                           'memo', 'legacy trivia movement (' || r.fam || ', pre-journal)'),
        jsonb_build_object('account', 'suspense:legacy', 'amount', -r.amount, 'user_id', r.user_id, 'memo', 'legacy counterpart')));
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'backfilled', v_n, 'skipped', v_skipped);
END $fn$;

-- ---------------------------------------------------------------------------------------------
-- 14. Rules snapshot on every session, PvP match and tournament instance (additive columns;
--     historical rows stay NULL = played before the registry existed)
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.trivia_sessions ADD COLUMN IF NOT EXISTS rules_version_id text REFERENCES public.trivia_rules_versions(id);
ALTER TABLE public.trivia_sessions ADD COLUMN IF NOT EXISTS rules_sha256 text;
ALTER TABLE public.trivia_pvp_matches ADD COLUMN IF NOT EXISTS rules_version_id text REFERENCES public.trivia_rules_versions(id);
ALTER TABLE public.trivia_pvp_matches ADD COLUMN IF NOT EXISTS rules_sha256 text;
ALTER TABLE public.trivia_tournaments ADD COLUMN IF NOT EXISTS rules_version_id text REFERENCES public.trivia_rules_versions(id);
ALTER TABLE public.trivia_tournaments ADD COLUMN IF NOT EXISTS rules_sha256 text;

CREATE OR REPLACE FUNCTION public.trivia_rules_snapshot_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_key text; v_id text; v record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.rules_version_id IS DISTINCT FROM OLD.rules_version_id OR NEW.rules_sha256 IS DISTINCT FROM OLD.rules_sha256 THEN
      RAISE EXCEPTION 'trivia rules snapshot on % is immutable', TG_TABLE_NAME USING ERRCODE = 'TL002';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.rules_version_id IS NULL THEN
    IF TG_TABLE_NAME = 'trivia_sessions' THEN v_key := public.trivia_rules_key_for_mode(NEW.mode);
    ELSIF TG_TABLE_NAME = 'trivia_pvp_matches' THEN v_key := 'pvp.standard';
    ELSE
      NEW.rules_sha256 := NULL;
      RETURN NEW;
    END IF;
    SELECT c.rules_version_id INTO v_id FROM public.trivia_rules_current c WHERE c.rules_key = v_key;
    IF v_id IS NULL THEN
      NEW.rules_sha256 := NULL;
      RETURN NEW;
    END IF;
    NEW.rules_version_id := v_id;
  END IF;
  SELECT rv.rules_sha256, rv.family, rv.mode INTO v FROM public.trivia_rules_versions rv WHERE rv.id = NEW.rules_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trivia rules snapshot % does not exist', NEW.rules_version_id USING ERRCODE = 'TL002';
  END IF;
  IF TG_TABLE_NAME = 'trivia_sessions' THEN
    IF v.mode IS DISTINCT FROM NEW.mode THEN
      RAISE EXCEPTION 'trivia rules snapshot % does not fit mode %', NEW.rules_version_id, NEW.mode USING ERRCODE = 'TL002';
    END IF;
  ELSIF TG_TABLE_NAME = 'trivia_pvp_matches' THEN
    IF v.family <> 'pvp' THEN
      RAISE EXCEPTION 'trivia rules snapshot % is not a PvP version', NEW.rules_version_id USING ERRCODE = 'TL002';
    END IF;
  ELSIF v.family <> 'tournament' THEN
    RAISE EXCEPTION 'trivia rules snapshot % is not a tournament version', NEW.rules_version_id USING ERRCODE = 'TL002';
  END IF;
  NEW.rules_sha256 := v.rules_sha256;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_trivia_p2_rules_snapshot ON public.trivia_sessions;
CREATE TRIGGER trg_trivia_p2_rules_snapshot BEFORE INSERT OR UPDATE OF rules_version_id, rules_sha256 ON public.trivia_sessions
  FOR EACH ROW EXECUTE FUNCTION public.trivia_rules_snapshot_guard();
DROP TRIGGER IF EXISTS trg_trivia_p2_rules_snapshot ON public.trivia_pvp_matches;
CREATE TRIGGER trg_trivia_p2_rules_snapshot BEFORE INSERT OR UPDATE OF rules_version_id, rules_sha256 ON public.trivia_pvp_matches
  FOR EACH ROW EXECUTE FUNCTION public.trivia_rules_snapshot_guard();
DROP TRIGGER IF EXISTS trg_trivia_p2_rules_snapshot ON public.trivia_tournaments;
CREATE TRIGGER trg_trivia_p2_rules_snapshot BEFORE INSERT OR UPDATE OF rules_version_id, rules_sha256 ON public.trivia_tournaments
  FOR EACH ROW EXECUTE FUNCTION public.trivia_rules_snapshot_guard();

-- ---------------------------------------------------------------------------------------------
-- 15. Access control: browsers get nothing; service_role reads and calls the service RPCs only
-- ---------------------------------------------------------------------------------------------
DO $do$
DECLARE
  t text; f text; seq text;
  v_tables text[] := ARRAY['trivia_rules_versions', 'trivia_rules_current', 'trivia_rules_current_history', 'trivia_ledger_accounts',
    'trivia_ledger_journals', 'trivia_ledger_lines', 'trivia_settlements', 'trivia_settlement_participants', 'trivia_settlement_events',
    'trivia_ledger_config', 'trivia_ledger_config_history', 'trivia_ledger_switches', 'trivia_ledger_switch_history',
    'trivia_ledger_idempotency_events', 'trivia_ledger_health_runs'];
  v_views text[] := ARRAY['trivia_ledger_account_balances', 'trivia_ledger_recon_reference', 'trivia_ledger_recon_settlement',
    'trivia_ledger_recon_match', 'trivia_ledger_recon_tournament', 'trivia_ledger_recon_user', 'trivia_ledger_recon_treasury',
    'trivia_ledger_recon_date'];
  v_service text[] := ARRAY[
    'public.trivia_ledger_hold(text,text,uuid,uuid,integer,text,text,text,jsonb)',
    'public.trivia_ledger_subsidy(text,text,uuid,uuid,integer,text,jsonb)',
    'public.trivia_ledger_release(text,text,uuid,uuid,text,text,jsonb)',
    'public.trivia_ledger_refund(text,text,uuid,uuid,text,text,jsonb)',
    'public.trivia_ledger_rake(text,text,uuid,integer,text,jsonb)',
    'public.trivia_ledger_debit(text,uuid,integer,text,text,text,text,text,jsonb)',
    'public.trivia_ledger_payout(text,uuid,integer,text,text,text,text,text,text,uuid,text,jsonb)',
    'public.trivia_settlement_open(text,uuid,text,jsonb)',
    'public.trivia_settlement_lock(text,uuid)',
    'public.trivia_settlement_settle(text,uuid,jsonb)',
    'public.trivia_settlement_status(text,uuid)',
    'public.trivia_rules_get(text)', 'public.trivia_rules_current(text)', 'public.trivia_rules_key_for_mode(text)',
    'public.trivia_rules_pvp_money(text,integer)', 'public.trivia_rules_tournament_prizes(text,bigint,jsonb)',
    'public.trivia_ledger_health_v1()', 'public.trivia_ledger_switch_enabled(text)', 'public.trivia_ledger_config_value(text)',
    'public.trivia_ledger_epoch()', 'public.trivia_ledger_switch_at(text,timestamptz)', 'public.trivia_ledger_platform_family(text,text)'];
  v_owner text[] := ARRAY[
    'public.trivia_ledger_raise(text,jsonb)', 'public.trivia_ledger_refuse_mutation()', 'public.trivia_ledger_sha256(text)',
    'public.trivia_rules_current_guard()', 'public.trivia_ledger_history_guard()', 'public.trivia_ledger_writer_active()',
    'public.trivia_ledger_write_guard()', 'public.trivia_ledger_assert_balanced()', 'public.trivia_ledger_ensure_account(text)',
    'public.trivia_ledger_error(text,text,text,text)', 'public.trivia_ledger_unexpected(text,text,text,text)',
    'public.trivia_ledger_begin(text,text,jsonb)', 'public.trivia_ledger_platform_move(text,uuid,bigint,text,text,text)',
    'public.trivia_ledger_post(jsonb,jsonb)', 'public.trivia_ledger_entry_settlement(text,uuid,uuid,bigint)',
    'public.trivia_ledger_treasury_guard(bigint)', 'public.trivia_ledger_exit_entry(text,text,text,uuid,uuid,text,text,jsonb)',
    'public.trivia_settlement_lock_row(public.trivia_settlements)', 'public.trivia_ledger_reverse(text,uuid,jsonb)',
    'public.trivia_ledger_repair(text,jsonb,jsonb,jsonb)', 'public.trivia_ledger_treasury_fund(text,integer,text,jsonb,text)',
    'public.trivia_ledger_set_switch(text,boolean,text)', 'public.trivia_ledger_set_config(text,bigint,text)',
    'public.trivia_rules_set_current(text,text,text)', 'public.trivia_ledger_backfill_legacy(integer)',
    'public.trivia_rules_snapshot_guard()'];
BEGIN
  FOREACH t IN ARRAY v_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('GRANT SELECT ON public.%I TO service_role', t);
    FOR seq IN SELECT pg_get_serial_sequence('public.' || t, a.attname) FROM pg_attribute a
                WHERE a.attrelid = ('public.' || t)::regclass AND a.attnum > 0 AND NOT a.attisdropped
                  AND pg_get_serial_sequence('public.' || t, a.attname) IS NOT NULL LOOP
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated, service_role', seq);
    END LOOP;
  END LOOP;
  FOREACH t IN ARRAY v_views LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('GRANT SELECT ON public.%I TO service_role', t);
  END LOOP;
  FOREACH f IN ARRAY v_service || v_owner LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
  END LOOP;
  FOREACH f IN ARRAY v_service LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $do$;

-- ---------------------------------------------------------------------------------------------
-- 16. Postconditions (any failure aborts and rolls back the whole migration)
-- ---------------------------------------------------------------------------------------------
DO $do$
DECLARE
  t text; f text; r record; v_n integer; v_refused boolean := false;
  v_probe uuid := '00000000-0000-4000-8000-00000000c0de';
  v_tables text[] := ARRAY['trivia_rules_versions', 'trivia_rules_current', 'trivia_rules_current_history', 'trivia_ledger_accounts',
    'trivia_ledger_journals', 'trivia_ledger_lines', 'trivia_settlements', 'trivia_settlement_participants', 'trivia_settlement_events',
    'trivia_ledger_config', 'trivia_ledger_config_history', 'trivia_ledger_switches', 'trivia_ledger_switch_history',
    'trivia_ledger_idempotency_events', 'trivia_ledger_health_runs', 'trivia_ledger_account_balances', 'trivia_ledger_recon_reference',
    'trivia_ledger_recon_settlement', 'trivia_ledger_recon_match', 'trivia_ledger_recon_tournament', 'trivia_ledger_recon_user',
    'trivia_ledger_recon_treasury', 'trivia_ledger_recon_date'];
BEGIN
  FOREACH t IN ARRAY v_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN RAISE EXCEPTION 'postcondition: % missing', t; END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_table_privilege('authenticated', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'postcondition: browser role has access to %', t;
    END IF;
    IF NOT has_table_privilege('service_role', 'public.' || t, 'SELECT')
       OR has_table_privilege('service_role', 'public.' || t, 'INSERT,UPDATE,DELETE,TRUNCATE') THEN
      RAISE EXCEPTION 'postcondition: service_role must read % and never write it directly', t;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY (v_tables) AND NOT c.relrowsecurity;
  IF v_n <> 0 THEN RAISE EXCEPTION 'postcondition: % ledger tables without RLS', v_n; END IF;

  FOR r IN SELECT p.oid::regprocedure AS sig, p.proname, p.prosecdef, p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND (p.proname LIKE 'trivia\_ledger\_%' OR p.proname LIKE 'trivia\_settlement\_%' OR p.proname LIKE 'trivia\_rules\_%') LOOP
    IF has_function_privilege('anon', r.sig, 'EXECUTE') OR has_function_privilege('authenticated', r.sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'postcondition: browser role can execute %', r.sig;
    END IF;
    IF r.prosecdef AND NOT EXISTS (SELECT 1 FROM unnest(r.proconfig) c WHERE c LIKE 'search_path=%') THEN
      RAISE EXCEPTION 'postcondition: security definer % has no pinned search_path', r.sig;
    END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY['public.trivia_ledger_hold(text,text,uuid,uuid,integer,text,text,text,jsonb)',
      'public.trivia_ledger_subsidy(text,text,uuid,uuid,integer,text,jsonb)', 'public.trivia_ledger_payout(text,uuid,integer,text,text,text,text,text,text,uuid,text,jsonb)',
      'public.trivia_settlement_settle(text,uuid,jsonb)', 'public.trivia_ledger_health_v1()'] LOOP
    IF NOT has_function_privilege('service_role', f, 'EXECUTE') THEN RAISE EXCEPTION 'postcondition: service_role cannot execute %', f; END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = f::regprocedure) THEN RAISE EXCEPTION 'postcondition: % must be security definer', f; END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY['public.trivia_ledger_post(jsonb,jsonb)', 'public.trivia_ledger_platform_move(text,uuid,bigint,text,text,text)',
      'public.trivia_ledger_reverse(text,uuid,jsonb)', 'public.trivia_ledger_repair(text,jsonb,jsonb,jsonb)',
      'public.trivia_ledger_treasury_fund(text,integer,text,jsonb,text)', 'public.trivia_ledger_set_switch(text,boolean,text)',
      'public.trivia_ledger_set_config(text,bigint,text)', 'public.trivia_rules_set_current(text,text,text)',
      'public.trivia_ledger_backfill_legacy(integer)', 'public.trivia_ledger_ensure_account(text)'] LOOP
    IF has_function_privilege('service_role', f, 'EXECUTE') THEN RAISE EXCEPTION 'postcondition: % must be owner-only', f; END IF;
  END LOOP;

  SELECT count(*) INTO v_n FROM public.trivia_rules_versions;
  IF v_n <> 15 THEN RAISE EXCEPTION 'postcondition: expected 15 rules versions, found %', v_n; END IF;
  IF EXISTS (SELECT 1 FROM public.trivia_rules_versions WHERE rules_sha256 <> public.trivia_ledger_sha256(rules_canonical)) THEN
    RAISE EXCEPTION 'postcondition: a rules version hash does not match its canonical text';
  END IF;
  IF (SELECT count(*) FROM public.trivia_rules_current c JOIN public.trivia_rules_versions v ON v.id = c.rules_version_id AND v.rules_key = c.rules_key) <> 15
     OR NOT EXISTS (SELECT 1 FROM public.trivia_rules_versions WHERE id = 'tournament.nightly@1' AND provisional)
     OR NOT EXISTS (SELECT 1 FROM public.trivia_rules_versions WHERE id = 'pvp.standard@1' AND rules -> 'stakes' = '[10,25,50,100]'::jsonb
                      AND (rules -> 'questions' ->> 'count')::integer = 20 AND (rules -> 'rake' ->> 'numerator')::integer = 10) THEN
    RAISE EXCEPTION 'postcondition: rules registry seed is incomplete';
  END IF;
  IF (SELECT count(*) FROM public.trivia_ledger_config) <> 6
     OR public.trivia_ledger_switch_enabled('solo_journal')
     OR (SELECT count(*) FROM pg_trigger WHERE tgname IN ('trg_trivia_ledger_journals_balanced', 'trg_trivia_ledger_lines_balanced')
          AND tgdeferrable AND tginitdeferred) <> 2 THEN
    RAISE EXCEPTION 'postcondition: config, switch or balanced-journal constraint missing';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
        AND table_name IN ('trivia_sessions', 'trivia_pvp_matches', 'trivia_tournaments')
        AND column_name IN ('rules_version_id', 'rules_sha256')) <> 6
     OR (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_trivia_p2_rules_snapshot') <> 3 THEN
    RAISE EXCEPTION 'postcondition: rules snapshot columns or triggers missing';
  END IF;

  -- Functional proof, rolled back: an unbalanced journal can never commit.
  BEGIN
    PERFORM set_config('trivia_ledger.writer', 'on', true);
    PERFORM set_config('trivia_ledger.open_journal', v_probe::text, true);
    INSERT INTO public.trivia_ledger_accounts (account_code, kind, tracks_balance, min_balance)
    VALUES ('suspense:legacy', 'legacy_suspense', true, NULL) ON CONFLICT (account_code) DO NOTHING;
    INSERT INTO public.trivia_ledger_journals (id, idempotency_key, request_hash, operation, source_event, actor_kind, funding_source,
        line_count, total_debit, total_credit, request, result, caller_role)
    VALUES (v_probe, 'postcondition-probe', repeat('0', 64), 'backfill', 'postcondition', 'system', 'legacy', 2, 5, 5,
            '{}'::jsonb, '{}'::jsonb, 'migration');
    INSERT INTO public.trivia_ledger_lines (journal_id, line_no, account_code, account_kind, amount, reconciliation_state)
    VALUES (v_probe, 1, 'suspense:legacy', 'legacy_suspense', 5, 'internal'),
           (v_probe, 2, 'suspense:legacy', 'legacy_suspense', -4, 'internal');
    SET CONSTRAINTS public.trg_trivia_ledger_journals_balanced, public.trg_trivia_ledger_lines_balanced IMMEDIATE;
    RAISE EXCEPTION 'probe-not-refused';
  EXCEPTION
    WHEN check_violation THEN v_refused := true;
    WHEN OTHERS THEN
      IF SQLERRM = 'probe-not-refused' THEN v_refused := false; ELSE RAISE; END IF;
  END;
  SET CONSTRAINTS public.trg_trivia_ledger_journals_balanced, public.trg_trivia_ledger_lines_balanced DEFERRED;
  PERFORM set_config('trivia_ledger.writer', '', true);
  PERFORM set_config('trivia_ledger.open_journal', '', true);
  IF NOT v_refused OR EXISTS (SELECT 1 FROM public.trivia_ledger_journals WHERE id = v_probe) THEN
    RAISE EXCEPTION 'postcondition: an unbalanced journal was not refused';
  END IF;
END $do$;

-- BEGIN BUILD FINGERPRINT (generated by the Phase 2 build; do not edit by hand)
-- The objects this migration installs must equal the build that was tested on the replica.
DO $fp$
DECLARE v_path text := pg_catalog.current_setting('search_path'); v_fp text;
BEGIN
  PERFORM pg_catalog.set_config('search_path', 'pg_catalog', true);
  WITH rel AS (
  SELECT c.oid, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.reloptions
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v') AND c.relname ~ '^trivia_(ledger_|settlement|rules_)'
), ext AS (
  SELECT c.oid, c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname IN ('trivia_sessions', 'trivia_pvp_matches', 'trivia_tournaments')
), anyrel AS (SELECT oid, relname FROM rel UNION ALL SELECT oid, relname FROM ext
), items(k, name, val) AS (
  SELECT 'fn', p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')',
         pg_catalog.md5(p.prosrc) || ':' || p.prosecdef::text || ':' || p.provolatile::text || ':' || p.prokind::text || ':'
         || COALESCE(pg_catalog.array_to_string(p.proconfig, ','), '') || ':' || pg_catalog.pg_get_function_result(p.oid)
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname ~ '^trivia_(ledger|settlement|rules)_'
  UNION ALL
  SELECT 'col', r.relname || '.' || a.attname,
         pg_catalog.format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text || ':' || a.attidentity::text || ':'
         || a.attgenerated::text || ':' || COALESCE(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '')
    FROM anyrel r JOIN pg_catalog.pg_attribute a ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
    LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE r.oid IN (SELECT oid FROM rel) OR a.attname IN ('rules_version_id', 'rules_sha256')
  UNION ALL
  SELECT 'con', r.relname || '.' || co.conname,
         pg_catalog.pg_get_constraintdef(co.oid) || ':' || co.condeferrable::text || ':' || co.condeferred::text
    FROM anyrel r JOIN pg_catalog.pg_constraint co ON co.conrelid = r.oid
   WHERE r.oid IN (SELECT oid FROM rel) OR co.conname LIKE '%rules\_version\_id%'
  UNION ALL
  SELECT 'idx', ic.relname, pg_catalog.pg_get_indexdef(ic.oid)
    FROM rel r JOIN pg_catalog.pg_index i ON i.indrelid = r.oid JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
  UNION ALL
  SELECT 'trg', c.relname || '.' || tg.tgname, pg_catalog.pg_get_triggerdef(tg.oid)
    FROM pg_catalog.pg_trigger tg JOIN pg_catalog.pg_class c ON c.oid = tg.tgrelid
   WHERE NOT tg.tgisinternal AND (c.oid IN (SELECT oid FROM rel) OR tg.tgname = 'trg_trivia_p2_rules_snapshot')
  UNION ALL
  SELECT 'view', r.relname, pg_catalog.md5(pg_catalog.pg_get_viewdef(r.oid)) || ':' || COALESCE(pg_catalog.array_to_string(r.reloptions, ','), '')
    FROM rel r WHERE r.relkind = 'v'
  UNION ALL
  SELECT 'rls', r.relname, r.relrowsecurity::text || ':' || r.relforcerowsecurity::text FROM rel r WHERE r.relkind = 'r'
  UNION ALL
  SELECT 'seed', v.id, v.rules_sha256 || ':' || pg_catalog.md5(v.rules_canonical) || ':' || v.provisional::text || ':' || pg_catalog.md5(v.approval_source)
    FROM public.trivia_rules_versions v
  UNION ALL
  SELECT 'cur', c.rules_key, c.rules_version_id FROM public.trivia_rules_current c
  UNION ALL
  SELECT 'cfg', c.key, c.value::text FROM public.trivia_ledger_config c
  UNION ALL
  SELECT 'sw', s.key, s.enabled::text FROM public.trivia_ledger_switches s
)
  SELECT pg_catalog.md5(pg_catalog.string_agg(k || '|' || name || '|' || val, E'\n' ORDER BY k COLLATE "C", name COLLATE "C")) FROM items INTO v_fp;
  PERFORM pg_catalog.set_config('search_path', v_path, true);
  IF v_fp IS DISTINCT FROM '78d533e87fa28555da02a91dd49abac3' THEN
    RAISE EXCEPTION 'trivia_p2_ledger_foundation: installed objects differ from the tested build (fingerprint %)', v_fp;
  END IF;
END $fp$;
-- END BUILD FINGERPRINT
