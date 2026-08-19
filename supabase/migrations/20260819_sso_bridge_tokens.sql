-- SSO Bridge Tokens
-- Used by /api/auth/commander-sso (smarter.poker) and /auth/sso (commander.smarter.poker)
-- to pass a one-time session token across the origin boundary without exposing the JWT.
--
-- Flow:
--   1. Hub validates user JWT, stores token_hash here (TTL 60s).
--   2. Commander /auth/sso receives raw token, hashes it, looks up row.
--   3. Row found + not used + not expired → mark used=true, return user_id.
--   4. Commander calls supabase.auth.setSession() with the hub's JWT to finish login.
--
-- Security:
--   - Raw token is never stored (only SHA-256 hash)
--   - 60-second TTL enforced by both app code and a cleanup cron
--   - used=true prevents replay

create table if not exists public.sso_bridge_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used        boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Only service role can read/write (SSO tokens should never be client-readable)
alter table public.sso_bridge_tokens enable row level security;

-- No RLS policies needed — service role bypasses RLS
-- Client-side access is intentionally blocked

-- Index for fast token lookup
create index if not exists sso_bridge_tokens_hash_idx on public.sso_bridge_tokens(token_hash);

-- Cleanup old tokens automatically (PostgreSQL doesn't auto-expire rows,
-- but this index + periodic delete in the exchange endpoint keeps the table small)
create index if not exists sso_bridge_tokens_expires_idx on public.sso_bridge_tokens(expires_at);

comment on table public.sso_bridge_tokens is
  'Short-lived one-time tokens for smarter.poker → commander.smarter.poker SSO. See /api/auth/commander-sso.';
