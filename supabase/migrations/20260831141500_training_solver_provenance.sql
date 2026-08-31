-- =============================================================================
-- 20260831141500_training_solver_provenance.sql
-- =============================================================================
-- TIER:        2
-- AUTHOR:      Codex Training Program
-- AFFECTS:     public.solved_spots_gold, public.sp_require_solver_write_provenance
-- IRREVERSIBLE: no
--
-- WHY:
--   Phase 4 proved that historical solver rows have no attributable machine,
--   binary, pipeline, manifest, artifact, quality, or audit identity. New
--   writes must fail closed instead of extending that unauditable corpus.
--
-- HOW:
--   Adds nullable provenance fields without rewriting historical rows, keeps
--   legacy data explicitly unverified, and gates every new/materially changed
--   solver artifact behind a complete validated v2 seal.
-- =============================================================================

begin;

-- Never sit behind live traffic holding a partial migration transaction. All
-- changes below are metadata-only; if the brief DDL lock is unavailable, the
-- migration aborts cleanly and can be retried in a quieter window.
set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $$
begin
  if to_regclass('public.solved_spots_gold') is null then
    raise exception 'pre-flight failed: public.solved_spots_gold does not exist';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'solved_spots_gold'
      and column_name = 'strategy_matrix'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'solved_spots_gold'
      and column_name = 'strategy_matrix_v2'
  ) then
    raise exception 'pre-flight failed: solver strategy columns are missing';
  end if;
end $$;

-- Phase 4: solver output is not certifiable without machine, binary,
-- pipeline, manifest, artifact, quality, and audit provenance.
-- Nullable columns preserve the historical legacy corpus honestly. The
-- canonical v2 worker writes every field for new validated exports.

alter table public.solved_spots_gold
  add column if not exists solver_version text,
  add column if not exists solver_binary_checksum text,
  add column if not exists machine_id text,
  add column if not exists pipeline_commit text,
  add column if not exists manifest_version text,
  add column if not exists manifest_checksum text,
  add column if not exists source_artifact_checksum text,
  add column if not exists quality_status text,
  add column if not exists audited_at timestamptz;

alter table public.solved_spots_gold
  drop constraint if exists solved_spots_gold_quality_status_check;

alter table public.solved_spots_gold
  add constraint solved_spots_gold_quality_status_check
  check (
    quality_status is null
    or quality_status in ('validated', 'legacy_sanitized', 'quarantined')
  ) not valid;

alter table public.solved_spots_gold
  drop constraint if exists solved_spots_gold_v2_provenance_check;

alter table public.solved_spots_gold
  add constraint solved_spots_gold_v2_provenance_check
  check (
    strategy_matrix_v2 is null
    -- Existing pre-provenance v2 artifacts may be explicitly quarantined
    -- without pretending their missing writer metadata can be reconstructed.
    -- The write trigger below still forbids inserting a new quarantined v2
    -- artifact or changing its matrix without the complete validated seal.
    or quality_status = 'quarantined'
    or (
      nullif(btrim(solver_version), '') is not null
      and coalesce(solver_binary_checksum, '') ~ '^[0-9a-f]{64}$'
      and coalesce(machine_id, '') in ('M1', 'M2')
      and coalesce(pipeline_commit, '') ~ '^[0-9a-f]{40}$'
      and nullif(btrim(manifest_version), '') is not null
      and coalesce(manifest_checksum, '') ~ '^[0-9a-f]{64}$'
      and coalesce(source_artifact_checksum, '') ~ '^[0-9a-f]{64}$'
      and quality_status = 'validated'
      and audited_at is not null
    )
  ) not valid;

-- Preserve the historical corpus without rewriting it, but stop every new or
-- materially changed solver artifact from entering through the anonymous
-- legacy five-column writer. Existing rows remain readable and can be audited
-- in place; a metadata-only quarantine update is still permitted.
create or replace function public.sp_require_solver_write_provenance()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  must_verify boolean := false;
begin
  if tg_op = 'INSERT' then
    must_verify := true;
  elsif new.strategy_matrix is distinct from old.strategy_matrix
     or new.strategy_matrix_v2 is distinct from old.strategy_matrix_v2 then
    must_verify := true;
  end if;

  if must_verify then
    if new.strategy_matrix_v2 is null
       or nullif(btrim(new.solver_version), '') is null
       or coalesce(new.solver_binary_checksum, '') !~ '^[0-9a-f]{64}$'
       or coalesce(new.machine_id, '') not in ('M1', 'M2')
       or coalesce(new.pipeline_commit, '') !~ '^[0-9a-f]{40}$'
       or nullif(btrim(new.manifest_version), '') is null
       or coalesce(new.manifest_checksum, '') !~ '^[0-9a-f]{64}$'
       or coalesce(new.source_artifact_checksum, '') !~ '^[0-9a-f]{64}$'
       or new.quality_status is distinct from 'validated'
       or new.audited_at is null then
      raise exception using
        errcode = '23514',
        message = 'solved_spots_gold requires a validated v2 artifact and complete solver provenance';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists solved_spots_gold_require_provenance on public.solved_spots_gold;
create trigger solved_spots_gold_require_provenance
before insert or update of strategy_matrix, strategy_matrix_v2
on public.solved_spots_gold
for each row execute function public.sp_require_solver_write_provenance();

comment on column public.solved_spots_gold.solver_version is
  'Physical solver binary/version reported by the supervised worker.';
comment on column public.solved_spots_gold.solver_binary_checksum is
  'SHA-256 of the exact approved PioSOLVER executable bytes.';
comment on column public.solved_spots_gold.machine_id is
  'Canonical supervised solver host identifier, currently M1 or M2.';
comment on column public.solved_spots_gold.pipeline_commit is
  'Exact protected repository commit from which the worker code was fetched.';
comment on column public.solved_spots_gold.manifest_checksum is
  'SHA-256 of the exact manifest bytes used to assign the solve.';
comment on column public.solved_spots_gold.source_artifact_checksum is
  'SHA-256 of the canonical JSON strategy_matrix_v2 payload.';
comment on column public.solved_spots_gold.quality_status is
  'Validated v2, explicitly legacy-sanitized, or quarantined; null means unaudited legacy.';
comment on column public.solved_spots_gold.audited_at is
  'UTC timestamp at which the worker quality gate accepted the exported artifact.';

do $$
declare
  missing_columns integer;
begin
  select count(*) into missing_columns
  from unnest(array[
    'solver_version', 'solver_binary_checksum', 'machine_id',
    'pipeline_commit', 'manifest_version', 'manifest_checksum',
    'source_artifact_checksum', 'quality_status', 'audited_at'
  ]) as expected(column_name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'solved_spots_gold'
      and c.column_name = expected.column_name
  );

  if missing_columns <> 0 then
    raise exception 'post-apply failed: % provenance columns are missing', missing_columns;
  end if;
  if to_regprocedure('public.sp_require_solver_write_provenance()') is null then
    raise exception 'post-apply failed: provenance trigger function is missing';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.solved_spots_gold'::regclass
      and tgname = 'solved_spots_gold_require_provenance'
      and not tgisinternal
  ) then
    raise exception 'post-apply failed: provenance trigger is missing';
  end if;
  if (
    select count(*) from pg_constraint
    where conrelid = 'public.solved_spots_gold'::regclass
      and conname in (
        'solved_spots_gold_quality_status_check',
        'solved_spots_gold_v2_provenance_check'
      )
  ) <> 2 then
    raise exception 'post-apply failed: provenance constraints are incomplete';
  end if;
end $$;

commit;
