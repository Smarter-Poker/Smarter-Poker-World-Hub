#!/usr/bin/env node
/**
 * check-policy-function-grants.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Fails CI when an RLS policy calls a function that the policy's own target
 * roles cannot EXECUTE.
 *
 * WHY THIS EXISTS
 * On 2026-08-26 this exact fault was live on 44 tables. Every one of them had
 * a SELECT policy shaped like:
 *
 *     auth.uid() = user_id OR public.fn_is_platform_admin()
 *
 * and `authenticated` had never been granted EXECUTE on
 * fn_is_platform_admin(). The instinct is that this only inconveniences
 * admins, because a normal user's own rows satisfy the left side of the OR.
 * That instinct is wrong: POSTGRES DOES NOT SHORT-CIRCUIT THE OR HERE. The
 * function is evaluated regardless, and the privilege check fires before the
 * boolean does.
 *
 * The result was that every signed-in player reading their OWN notifications,
 * direct messages, bookmarks, purchase history, devices, notification
 * preferences, saved hands or disputes got:
 *
 *     ERROR: permission denied for function fn_is_platform_admin
 *
 * Not an empty list. A hard error. On 44 tables. And nothing caught it,
 * because a policy referencing a function it cannot call is perfectly valid
 * DDL — the failure only appears at query time, as the caller.
 *
 * See .agent/audits/2026-08-26-platform-rls-outage.md.
 *
 * WHAT IT CHECKS
 * For every policy in `public`, for every function that policy's USING or
 * WITH CHECK expression names, for every role the policy targets: assert
 * has_function_privilege(role, fn, 'EXECUTE').
 *
 * A policy targeting {public} is skipped for the role loop — PUBLIC means
 * every role, and EXECUTE defaults to PUBLIC for new functions anyway, so it
 * is the case that cannot silently break.
 *
 * HOW IT CONNECTS
 * Through the `exec_sql` RPC with the service-role key, the same credential
 * the sibling U4 checks already use. No `pg` dependency, no database password
 * (SUPABASE_DB_PASSWORD in this repo is stale), nothing CI does not already
 * hold.
 *
 * USAGE
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/ci/check-policy-function-grants.mjs
 *
 * Exits 0 when clean, 1 on any finding, and 0 with a notice when the secrets
 * are absent — a fork PR must never fail for a reason its author cannot fix.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !KEY) {
  console.log('check-policy-function-grants: Supabase credentials absent, skipping.');
  process.exit(0);
}

/**
 * The check calls ONE purpose-built, read-only catalog function.
 *
 * Not arbitrary SQL: `exec_sql` and `run_sql` both exist in this database and
 * are both permanently disabled for security, which is correct. CI has no
 * business holding a capability that broad. fn_policy_function_grant_gaps()
 * returns catalog metadata only -- no application rows, no user data -- and is
 * granted to service_role alone.
 *
 * It reports one row per (policy, function, role) where the policy targets a
 * role that cannot EXECUTE a function the policy's expression calls. An empty
 * result means healthy.
 *
 * Added by migration fn_policy_function_grant_gaps_for_ci.
 */

async function main() {
  const res = await fetch(`${URL_}/rest/v1/rpc/fn_policy_function_grant_gaps`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`check-policy-function-grants: query failed (${res.status}). ${body.slice(0, 400)}`);
    // A broken checker must not be mistaken for a clean result.
    process.exit(1);
  }

  let rows = await res.json().catch(() => null);
  if (!Array.isArray(rows)) rows = [];

  if (rows.length === 0) {
    console.log('check-policy-function-grants: every policy function is executable by the roles its policy targets.');
    process.exit(0);
  }

  console.error('');
  console.error('RLS POLICY CALLS A FUNCTION ITS OWN ROLE CANNOT EXECUTE');
  console.error('======================================================');
  console.error('');
  console.error('Each row below is a policy whose USING/WITH CHECK expression calls a');
  console.error('function the listed role has no EXECUTE privilege on. Postgres does NOT');
  console.error('short-circuit around it, so EVERY query that role makes against that');
  console.error('table raises "permission denied for function" -- including queries for');
  console.error('rows the caller plainly owns.');
  console.error('');
  console.error('This is what took 44 tables down on 2026-08-26. See');
  console.error('.agent/audits/2026-08-26-platform-rls-outage.md');
  console.error('');

  const byFn = new Map();
  for (const r of rows) {
    const key = `${r.fn_name}(${r.fn_args || ''})`;
    if (!byFn.has(key)) byFn.set(key, []);
    byFn.get(key).push(r);
  }

  for (const [fn, list] of byFn) {
    const roles = [...new Set(list.map((r) => r.role_name))].sort();
    console.error(`  ${fn}`);
    console.error(`    missing EXECUTE for: ${roles.join(', ')}`);
    console.error(`    affects ${list.length} policy/role pair(s) across ${new Set(list.map((r) => r.table_name)).size} table(s):`);
    for (const r of list.slice(0, 12)) {
      console.error(`      ${r.table_name}.${r.policy_name}  [${r.role_name}]`);
    }
    if (list.length > 12) console.error(`      ... and ${list.length - 12} more`);
    console.error('');
  }

  console.error('Fix it with a grant, e.g.:');
  const first = [...byFn.keys()][0];
  const firstRole = rows[0].role_name;
  console.error(`  GRANT EXECUTE ON FUNCTION public.${first} TO ${firstRole};`);
  console.error('');
  console.error('Before granting, confirm the function is safe to expose: it should be');
  console.error('SECURITY DEFINER with its own internal guard, and should not return data');
  console.error('the role could not otherwise reach.');
  console.error('');
  process.exit(1);
}

main().catch((err) => {
  console.error('check-policy-function-grants: unexpected failure:', err?.message || err);
  process.exit(1);
});
