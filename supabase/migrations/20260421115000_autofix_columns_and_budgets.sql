-- ═════════════════════════════════════════════════════════════════════════
-- Autofix Phase A + P1 hardening: add Vercel source, per-loop budget
-- buckets, global kill-switch, and operational timestamps to the shared
-- autofix_attempts table.
-- ═════════════════════════════════════════════════════════════════════════

-- 1. New columns on autofix_attempts ---------------------------------------
alter table public.autofix_attempts
  add column if not exists source              text,   -- 'sentry' | 'vercel'
  add column if not exists deployment_id       text,   -- Vercel dpl_*
  add column if not exists commit_sha          text,   -- 40-char git sha
  add column if not exists strategy            text,   -- oom | missing-dep | tsc | generic
  add column if not exists confidence          text,   -- high | medium | low
  add column if not exists branch_name         text,
  add column if not exists pr_number           int,
  -- P2 operational timestamps (nullable, populated when the event happens)
  add column if not exists pr_opened_at        timestamptz,
  add column if not exists reviewed_at         timestamptz,
  add column if not exists merged_at           timestamptz,
  add column if not exists reverted_at         timestamptz,
  add column if not exists build_verified_at   timestamptz;

-- Backfill source for existing rows
update public.autofix_attempts
   set source = 'sentry'
 where source is null;

-- 2. Per-commit dedupe index (Vercel only) ---------------------------------
drop index if exists public.one_open_per_commit_sha;
create unique index one_open_per_commit_sha
  on public.autofix_attempts (commit_sha, source)
  where source = 'vercel'
    and status in ('running', 'pr_opened');

create index if not exists autofix_attempts_source_commit_idx
  on public.autofix_attempts (source, commit_sha)
  where source = 'vercel';

-- 3. Per-loop budget buckets ----------------------------------------------
-- Replaces the single autofix_budget_exhausted() RPC with one that accepts
-- a source parameter. Old callers (no arg) still work — they get the
-- global cap. New callers pass 'sentry' or 'vercel' and get a smaller cap.
create table if not exists public.autofix_budget (
  source          text primary key,           -- 'sentry' | 'vercel' | '_global'
  daily_cap_usd   numeric(10, 4) not null,    -- dollars/day
  notes           text
);
insert into public.autofix_budget (source, daily_cap_usd, notes) values
  ('_global', 1.60, 'Hard global cap across both loops.'),
  ('sentry',  1.00, 'Sentry runtime-error autofix.'),
  ('vercel',  0.60, 'Vercel build-failure autofix.')
on conflict (source) do nothing;

create or replace function public.autofix_budget_exhausted(p_source text default '_global')
returns boolean
language plpgsql
security definer
as $$
declare
  cap     numeric;
  spent   numeric;
  -- Claude Haiku 4.5 token pricing ($/MTok)
  price_in  numeric := 1.00;
  price_out numeric := 5.00;
begin
  select daily_cap_usd into cap
    from public.autofix_budget
   where source = p_source;
  if cap is null then
    -- Unknown source → fall back to global
    select daily_cap_usd into cap from public.autofix_budget where source = '_global';
  end if;

  select coalesce(sum(
            (coalesce(claude_tokens_in,  0)::numeric / 1000000) * price_in +
            (coalesce(claude_tokens_out, 0)::numeric / 1000000) * price_out
         ), 0)
    into spent
    from public.autofix_attempts
   where created_at >= date_trunc('day', now() at time zone 'utc')
     and (p_source = '_global' or source = p_source);

  return spent >= cap;
end;
$$;

-- 4. Global kill-switch ----------------------------------------------------
-- Either poller checks this flag at start of run. Flip to true with:
--   update autofix_config set paused = true, paused_reason = '...';
-- to halt both loops without SSHing to cron-01.
create table if not exists public.autofix_config (
  id             int primary key default 1 check (id = 1), -- singleton
  paused         boolean not null default false,
  paused_reason  text,
  paused_by      text,
  paused_at      timestamptz,
  updated_at     timestamptz not null default now()
);
insert into public.autofix_config (id) values (1) on conflict (id) do nothing;

create or replace function public.autofix_is_paused()
returns boolean
language sql
security definer
as $$
  select coalesce((select paused from public.autofix_config where id = 1), false);
$$;

-- 5. Per-project canary flag -----------------------------------------------
-- Allows a project to be in DRY_RUN mode — poller detects, classifies, and
-- records the row, but does NOT dispatch the GitHub workflow. Lets a new
-- project bake for 24h before going live.
create table if not exists public.autofix_projects (
  id              text primary key,              -- projectId for Vercel, repo for Sentry
  source          text not null,
  name            text,
  dry_run         boolean not null default true, -- safe default
  enabled         boolean not null default true,
  notes           text,
  updated_at      timestamptz not null default now()
);

-- 6. Comments --------------------------------------------------------------
comment on table public.autofix_budget is
  'Per-loop daily spend caps. Shared RPC autofix_budget_exhausted(source) honors them.';
comment on table public.autofix_config is
  'Singleton runtime config for the autofix pipeline. Kill-switch lives here.';
comment on table public.autofix_projects is
  'Per-project flags: dry_run (classify but do not dispatch) and enabled (ignore entirely).';
comment on column public.autofix_attempts.source is
  'Origin of the failure: ''sentry'' (runtime error) or ''vercel'' (build failure).';
comment on column public.autofix_attempts.pr_opened_at is
  'When the draft PR was opened by open-pr.mjs.';
comment on column public.autofix_attempts.merged_at is
  'When a human (or future automation) merged the PR.';
comment on column public.autofix_attempts.reverted_at is
  'When the merge was reverted because the next deploy also failed (Phase B).';
comment on column public.autofix_attempts.build_verified_at is
  'When the post-merge deploy succeeded (Phase B closes the loop here).';
