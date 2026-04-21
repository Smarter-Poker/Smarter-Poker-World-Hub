-- ═════════════════════════════════════════════════════════════════════════
-- Vercel-autofix extensions to the autofix_attempts table
--
-- The Sentry-loop schema tracks (issue_id, event_id). Vercel build failures
-- don't have either — they have (deployment_id, commit_sha). Add nullable
-- columns so both loops share one table, plus a `source` discriminator and
-- a per-commit dedupe index.
-- ═════════════════════════════════════════════════════════════════════════

-- 1. New columns ------------------------------------------------------------
alter table public.autofix_attempts
  add column if not exists source           text,   -- 'sentry' | 'vercel'
  add column if not exists deployment_id    text,   -- Vercel dpl_*
  add column if not exists commit_sha       text,   -- 40-char git sha
  add column if not exists strategy         text,   -- oom | missing-dep | tsc | generic
  add column if not exists confidence       text,   -- high | medium | low
  add column if not exists branch_name      text,   -- PR branch
  add column if not exists pr_number        int;

-- Backfill source for existing rows (all pre-existing rows are sentry-sourced)
update public.autofix_attempts
   set source = 'sentry'
 where source is null;

-- 2. Per-commit dedupe so the poller can't fire twice for one build --------
-- Partial index: only OPEN statuses block a new attempt. Once a run reaches
-- merged / skipped_unfixable / reverted, a later push to the same SHA is
-- allowed (rare, but guards against force-push weirdness).
drop index if exists public.one_open_per_commit_sha;
create unique index one_open_per_commit_sha
  on public.autofix_attempts (commit_sha, source)
  where source = 'vercel'
    and status in ('running', 'pr_opened');

-- 3. Budget RPC already exists (autofix_budget_exhausted) — no change needed.
--    It sums cost across sentry + vercel attempts because they share the
--    claude_tokens_in / claude_tokens_out columns.

-- 4. Helpful index for the poller's alreadyAttempted() lookup --------------
create index if not exists autofix_attempts_source_commit_idx
  on public.autofix_attempts (source, commit_sha)
  where source = 'vercel';

-- 5. Comment for the table so future-you knows the two loops coexist -------
comment on column public.autofix_attempts.source is
  'Origin of the failure: ''sentry'' (runtime error) or ''vercel'' (build failure). NULL on legacy rows.';
comment on column public.autofix_attempts.deployment_id is
  'Vercel deployment ID (dpl_*) — only set for source=vercel.';
comment on column public.autofix_attempts.commit_sha is
  'Git commit SHA the failure was attributed to. Unique-within-open for source=vercel.';
comment on column public.autofix_attempts.strategy is
  'Which autofix strategy was chosen: oom | missing-dep | tsc | generic (vercel), or the sentry strategy name.';
