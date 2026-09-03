-- =====================================================================
-- Phase 2 follow-up: the two operator READ functions stop pretending to
-- audit. Project kuklfnapbkmacvwxktbh (Postgres 17).
-- Follows 20260903120000_ca_operator_rbac_and_approvals.sql, which is
-- applied and registered in supabase_migrations.schema_migrations.
-- Contract: docs/horses/PHASE2-CONTRACTS.md section 1.
--
-- WHAT THIS IS
-- CREATE OR REPLACE of exactly two functions,
-- fn_ca_operator_audit_trail(text, text, int, int) and
-- fn_ca_operator_staff(), each byte-identical to its 20260903120000
-- definition except that the guarded fn_log_admin_action block at the end
-- of the body is deleted. No table, index, column, policy, signature,
-- return type or default changes. The REVOKE and GRANT lines for both
-- functions are repeated below so this file is ACL self-contained the
-- same way 20260903120000 is: a CREATE OR REPLACE keeps the existing
-- ACL, and restating it means the file can be read on its own and still
-- say who may execute these functions.
--
-- WHAT WAS WRONG
-- Both of these are READS, and neither signature carries an actor. So
-- both filed their audit row as
--   perform public.fn_log_admin_action(p_admin_user_id := null, ...)
-- and production's fn_log_admin_action REFUSES a null actor: it raises
-- "admin_user_id required". The call is wrapped in
--   begin ... exception when others then raise notice ... end;
-- which is correct for a real audit write (a broken trail must never
-- fail an operator action) but here it swallowed a failure that happens
-- EVERY time. Not sometimes, not under load: every single call, since
-- the migration was applied. So the trail has never contained one
-- operator.staff.read or operator.audit_trail.read row and never could.
--
-- A write that can never succeed is worse than no write. Dead code that
-- looks like an audit teaches the next reader that the trail covers the
-- staff list and the per-record trail views. It does not. Somebody
-- answering "who looked at this player's history" would read the
-- function, believe the answer was in admin_audit_log, find nothing, and
-- conclude nobody looked. Deleting the block makes the file tell the
-- truth: these two functions do not audit.
--
-- HOW IT WAS FOUND
-- A rolled-back production simulation, run today against the applied
-- schema inside a transaction that was rolled back before it committed.
-- The same sim proved every behaviour 20260903120000 claims; this was
-- the one defect it turned up. It is not visible from the file alone,
-- because the file's own exception handler hides it, and it is not
-- visible in the logs either, because a `raise notice` is not an error.
-- It is only visible by looking for the rows afterwards and finding
-- none.
--
-- WHERE THE REAL AUDIT ROW COMES FROM
-- pages/api/horses/operator-admin.js is the only caller of both
-- functions. Its four write actions (grant_role, revoke_role,
-- set_policy, decide_approval) each call auditOperatorAction from
-- src/lib/horses/operatorAudit.js AFTER the RPC returns, which is the
-- write that carries the REAL actor: op.user.id, the actor role, the ip
-- address, the user agent and the request id. That is the row an
-- investigation actually wants, and it is unaffected by anything here.
-- Being accurate about the rest, because this migration exists to stop a
-- file overstating its coverage: the GET sections of that route (staff,
-- roles, policy, approvals, audit_trail) currently file no
-- admin_audit_log row at all. Removing these two dead writes therefore
-- does not move a read out of the trail, because no read was ever in it.
-- It removes the claim that one was. That is the same position
-- 20260903120000 already argued for fn_ca_operator_permissions under
-- WHY PERMISSION RESOLUTION DOES NOT AUDIT ITSELF: a console read behind
-- a cache, filed thousands of times a day, buries the trail it is
-- supposed to enrich.
--
-- WHY NOT ADD AN ACTOR PARAMETER
-- The obvious repair is to give each function a p_actor_id uuid and pass
-- op.user.id from the route, which would make the audit write succeed.
-- That is a SIGNATURE CHANGE. A new parameter creates an overload rather
-- than replacing the function, so it needs the old signature dropped,
-- the route updated and deployed in lock step with the drop, and the ACL
-- re-granted on the new signature. CLAUDE.md section 1.2 makes an RPC
-- overload change Tier 3, which needs its own plan, its own pre-flight,
-- and its own pasted ROLLBACK. It is also a product decision that has
-- not been made: whether console READS belong in admin_audit_log at all
-- is exactly the question section 1's fn_ca_operator_permissions
-- correction answered "no" for the highest-volume read. Whichever way it
-- lands, it is a later phase and a separate migration. This file does
-- the part that is unambiguous today: stop writing something that can
-- never be written.
--
-- SAFETY
-- CREATE OR REPLACE FUNCTION takes a lock on the function only. Neither
-- function is called by any other database object; both are called by
-- one route, over PostgREST, and a call in flight during the replace
-- either finishes on the old body or runs the new one. Both bodies
-- return the same jsonb shape as before, key for key, so no caller
-- changes. Nothing here can narrow anybody's access: the ACL restated
-- below is identical to the one 20260903120000 installed, which is
-- contract section 0.
-- =====================================================================

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------
-- 1. One record's full audit history
-- ---------------------------------------------------------------------
-- Was 20260903120000 section 5.8. Identical, minus the audit block.
create or replace function public.fn_ca_operator_audit_trail(
  p_target_type text,
  p_target_id   text,
  p_limit       int,
  p_offset      int
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_limit  int := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_total  bigint := 0;
  v_rows   jsonb := '[]'::jsonb;
begin
  select count(*) into v_total
  from public.admin_audit_log a
  where a.target_type = p_target_type
    and a.target_id = p_target_id;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
    into v_rows
  from (
    select a.id, a.admin_user_id, a.actor_role, a.action, a.target_type, a.target_id,
           a.details, a.before_state, a.after_state, a.ip_address, a.user_agent,
           a.request_id, a.created_at
    from public.admin_audit_log a
    where a.target_type = p_target_type
      and a.target_id = p_target_id
    order by a.created_at desc
    limit v_limit offset v_offset
  ) t;

  -- This function files NO audit row. It is a read with no actor in its
  -- signature, so the write it used to attempt passed a null actor and
  -- was refused every time. See the header. The route's write actions
  -- audit with the real actor through operatorAudit.js.

  return jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
end
$fn$;

revoke all on function public.fn_ca_operator_audit_trail(text, text, int, int) from public, anon, authenticated;
grant execute on function public.fn_ca_operator_audit_trail(text, text, int, int) to service_role;

-- ---------------------------------------------------------------------
-- 2. The staff list
-- ---------------------------------------------------------------------
-- Was 20260903120000 section 5.9. Identical, minus the audit block. The
-- inner `raise notice` on the MFA read is NOT the audit block and stays:
-- auth.mfa_factors genuinely may not be readable, and missing MFA state
-- is reported as null rather than as a failed staff page.
--
-- Everyone who reaches the console: a legacy profile role, or at least
-- one grant ever (revoked included, so a removed operator does not
-- vanish from the page that records the removal).
--
-- Each row carries its active grants twice: `granted_roles` as bare role
-- keys, and `grants` as objects with the grant id. Both, because the id
-- is what a revoke names and the plain keys are what the first build of
-- the console renders.
create or replace function public.fn_ca_operator_staff()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_mfa  jsonb := '{}'::jsonb;
  v_rows jsonb := '[]'::jsonb;
begin
  -- auth.mfa_factors is not present on every project and the definer may
  -- not be able to read it. Missing MFA state is reported as null, never
  -- as "no MFA", and never as a failed staff page.
  begin
    if to_regclass('auth.mfa_factors') is not null then
      execute $q$
        select coalesce(jsonb_object_agg(user_id::text, cnt), '{}'::jsonb)
        from (
          select user_id, count(*) as cnt
          from auth.mfa_factors
          where status = 'verified'
          group by user_id
        ) m
      $q$ into v_mfa;
    end if;
  exception when others then
    raise notice 'fn_ca_operator_staff mfa read failed: %', sqlerrm;
    v_mfa := '{}'::jsonb;
  end;

  -- Widest role first, which is rank descending: ROLE_META gives god 100
  -- and read_only 10.
  select coalesce(jsonb_agg(to_jsonb(s) order by s.rank desc, s.email), '[]'::jsonb)
    into v_rows
  from (
    select
      p.id                                   as user_id,
      p.email,
      p.username,
      p.display_name,
      p.role                                 as profile_role,
      coalesce(r.rank, 0)                    as rank,
      coalesce(
        (select jsonb_agg(g.role_key order by g.role_key)
         from public.ca_operator_grants g
         where g.user_id = p.id and g.revoked_at is null),
        '[]'::jsonb
      )                                      as granted_roles,
      -- The same active grants again, WITH THEIR IDS. granted_roles is
      -- kept beside this and unchanged, because it is what the first
      -- build of the console reads; this array is additive.
      -- fn_ca_operator_revoke takes a grant id and a revoked grant is
      -- kept rather than deleted, so the id IS the record: without it
      -- the Staff tab can list the roles an operator holds and offer no
      -- way to take one back, which is a console that can only ever
      -- widen. granted_by and reason travel with it so the row can say
      -- who gave it and why without a second request.
      coalesce(
        (select jsonb_agg(
                  jsonb_build_object(
                    'id', g.id,
                    'role_key', g.role_key,
                    'granted_at', g.granted_at,
                    'granted_by', g.granted_by,
                    'reason', g.reason
                  ) order by g.granted_at desc
                )
         from public.ca_operator_grants g
         where g.user_id = p.id and g.revoked_at is null),
        '[]'::jsonb
      )                                      as grants,
      (select count(*) from public.ca_operator_grants g where g.user_id = p.id) as grant_history_count,
      u.last_sign_in_at,
      case
        when v_mfa = '{}'::jsonb then null
        else coalesce((v_mfa ->> p.id::text)::int, 0) > 0
      end                                    as mfa_enabled
    from public.profiles p
    left join public.ca_operator_roles r on r.key = p.role
    left join auth.users u on u.id = p.id
    where exists (
            select 1 from public.ca_operator_roles lr
            where lr.key = p.role and lr.is_legacy
          )
       or exists (
            select 1 from public.ca_operator_grants g where g.user_id = p.id
          )
  ) s;

  -- This function files NO audit row. Same reason as
  -- fn_ca_operator_audit_trail above: a read with no actor in its
  -- signature cannot write a row the audit helper will accept.

  return jsonb_build_object('staff', v_rows, 'total', jsonb_array_length(v_rows));
end
$fn$;

revoke all on function public.fn_ca_operator_staff() from public, anon, authenticated;
grant execute on function public.fn_ca_operator_staff() to service_role;

-- ---------------------------------------------------------------------
-- 3. Assertions
-- ---------------------------------------------------------------------
-- The migration aborts on its own assumption violations rather than
-- leaving the console with a function that no longer exists, no longer
-- answers jsonb, or still carries the dead write this file came to
-- remove.

do $assert$
declare
  v_sig  text;
  v_proc regprocedure;
  v_ret  text;
  v_src  text;
  v_out  jsonb;
begin
  foreach v_sig in array array[
    'public.fn_ca_operator_audit_trail(text, text, int, int)',
    'public.fn_ca_operator_staff()'
  ]
  loop
    -- 1. It still exists, under the same signature. A CREATE OR REPLACE
    --    that fat-fingered a parameter type would have created an
    --    OVERLOAD and left the old body in place, which is the exact
    --    failure this check is here to catch.
    v_proc := to_regprocedure(v_sig);
    if v_proc is null then
      raise exception 'ASSERT FAILED: % does not exist after this migration', v_sig;
    end if;

    select pg_catalog.format_type(p.prorettype, null), p.prosrc
      into v_ret, v_src
    from pg_catalog.pg_proc p
    where p.oid = v_proc::oid;

    -- 2. It still returns jsonb. Every caller in
    --    pages/api/horses/operator-admin.js reads keys off the result.
    if v_ret is distinct from 'jsonb' then
      raise exception 'ASSERT FAILED: % returns %, expected jsonb', v_sig, v_ret;
    end if;

    -- 3. The dead audit write is gone from the installed body. This is
    --    the whole point of the file, asserted against pg_proc.prosrc
    --    rather than against the text of this file, so it is the
    --    DATABASE that confirms it.
    if v_src ilike '%fn_log_admin_action%' then
      raise exception 'ASSERT FAILED: % still calls fn_log_admin_action', v_sig;
    end if;

    raise notice 'ASSERT OK: % exists, returns jsonb, files no audit row', v_sig;
  end loop;

  -- 4. Both bodies still RUN and still answer the shape the console
  --    reads. A body edited down by hand that no longer parses at run
  --    time would pass all three checks above, because plpgsql compiles
  --    on first call, not on CREATE.
  v_out := public.fn_ca_operator_staff();
  if v_out is null or not (v_out ? 'staff') or not (v_out ? 'total') then
    raise exception 'ASSERT FAILED: fn_ca_operator_staff no longer answers { staff, total }: %', v_out;
  end if;

  v_out := public.fn_ca_operator_audit_trail('operator', 'assertion_probe_no_such_target', 1, 0);
  if v_out is null
     or not (v_out ? 'rows') or not (v_out ? 'total')
     or not (v_out ? 'limit') or not (v_out ? 'offset') then
    raise exception 'ASSERT FAILED: fn_ca_operator_audit_trail no longer answers { rows, total, limit, offset }: %', v_out;
  end if;
  if jsonb_array_length(v_out -> 'rows') <> 0 then
    raise exception 'ASSERT FAILED: the probe target matched % rows, so it is not the empty probe it was meant to be',
      jsonb_array_length(v_out -> 'rows');
  end if;

  raise notice 'ASSERT OK: both read functions run and answer their contract shape.';
end
$assert$;

-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- There is deliberately NO pasted rollback script here, and this is the
-- one line that says why: restoring a write that always fails is not a
-- rollback anyone wants.
--
-- Undoing this file means putting back a fn_log_admin_action call whose
-- only observable effect is a `raise notice` on every read, so a pasted
-- script would be a loaded foot-gun sitting under a heading that implies
-- somebody might sensibly run it. Nothing here can be the cause of an
-- incident either: no table, index, ACL, signature or returned key
-- changed, and both bodies are asserted above to still run and still
-- answer their contract shape.
--
-- THE ROLLBACK, IF ONE IS EVER GENUINELY NEEDED, IS TO RE-APPLY THE
-- fn_ca_operator_audit_trail AND fn_ca_operator_staff DEFINITIONS FROM
-- supabase/migrations/20260903120000_ca_operator_rbac_and_approvals.sql
-- VERBATIM, sections 5.8 and 5.9, together with their REVOKE and GRANT
-- lines. Those definitions are in the repository, unmodified, and they
-- are what this file's two functions were copied from. Copy them out and
-- run them; do not reconstruct them from memory or from this file.
-- =====================================================================
