# Privileged-grant guard — preventive enforcement in Postgres

**Date:** 2026-08-16
**Scope:** Supabase `public` schema, money/privileged RPC EXECUTE grants
**Status:** applied to production and probe-verified

---

## Why

Three times in one audit cycle a newly created money RPC silently inherited
`PUBLIC` EXECUTE (Postgres' default grant), leaving it `anon`-callable. Docs did
not stop it. `fn_audit_privileged_grants()` (2026-08-16, section 26 of the master
audit) made it *visible* — CRITICAL went 5 to 0 — but detection is not
prevention.

The plan was a CI gate. That plan is dead: `.github/workflows/ci.yml` carries
only `SENTRY_AUTH_TOKEN` and `GITHUB_TOKEN`. **CI has no Supabase credentials**,
so it cannot query the invariant. A manifest substitute would be detective and
staleness-prone.

Enforcement therefore lives in the database, where no agent can skip it.

## What was applied

| Migration | Object |
|---|---|
| `20260816153228` | `trg_autorevoke_privileged_anon` gains the `GRANT` tag + bypass GUC |
| `20260816153443` | `privileged_function_lock` table + seed |
| `20260816153613` | types-only signatures, `to_regprocedure()` resolution, `fn_verify_privileged_lock()` |
| `20260816153711` | `fn_grant_guard_health()` |

On `CREATE FUNCTION` / `ALTER FUNCTION`, any function whose name matches the
money/privileged pattern has `PUBLIC` and `anon` EXECUTE stripped and is recorded
in `privileged_function_lock`. On any function-level `GRANT`, the whole lock list
is re-asserted.

Deliberate exception, one transaction only:

```sql
SET app.allow_privileged_anon_grant = 'on';
GRANT EXECUTE ON FUNCTION public.fn_something_public(uuid) TO anon;
```

## Verification (rollback probes against production, zero leftovers)

| Scenario | anon EXECUTE after | Verdict |
|---|---|---|
| `CREATE FUNCTION fn_probe_chip_…` | `false` | trigger fired |
| `CREATE FUNCTION fn_probe_plain_…` | `true` | scope provably narrow |
| auto-locked into `privileged_function_lock` | `true` | new function locks itself |
| targeted `GRANT … TO anon` | `false` | sweep undid it |
| multi-object `GRANT a, b TO anon` | priv `false`, plain `true` | correct per-object outcome |
| `ALTER FUNCTION … SET search_path` | `false` | re-asserted on ALTER |
| grant under bypass GUC | `true` | exception honoured |
| next unrelated GRANT after bypass | `false` | self-heals |

Post-probe: 0 probe functions, 0 probe tables, 0 probe event triggers remaining.

## Two things worth remembering

**1. A GRANT event does not identify what was granted.** A diagnostic event
trigger logging raw `pg_event_trigger_ddl_commands()` produced:

```
[tag=GRANT | object_type=FUNCTION | objid=NULL | ident=NULL]
```

Uppercase `object_type` (lowercase `function` for CREATE/ALTER) and **no object
identity**. That is why the lock table exists — the trigger re-asserts a reviewed
list rather than resolving a target it cannot see.

**2. The guard nearly became an outage.** The lock table first stored
`pg_get_function_identity_arguments()`, which includes parameter names
(`public.add_bbj_contribution(p_club_id uuid, …)`). That form is legal in
GRANT/REVOKE but is rejected by `::regprocedure`. An error inside an event
trigger aborts the statement that fired it — so the first function `GRANT`
anywhere in the database would have failed, and every one after it. Caught by
probe before any GRANT ran; fixed with types-only signatures,
`to_regprocedure()` (returns NULL instead of raising), and a migration-time
assertion.

> **Rule:** an enforcement mechanism that can throw is a new failure mode, not
> just a new guard. Prove it under the exact statement it will intercept, not
> merely under the statement that installs it.

## Standing contract

```sql
SELECT * FROM fn_grant_guard_health();   -- every row must read status = 'OK'
```

Currently all six `OK`: trigger enabled, all three tags watched, 0 of 163 locked
functions regressed, 0 stale entries, 0 CRITICAL.

## Deliberately not done

The 27 MEDIUM + 8 LOW anon-executable money functions are **not** in the lock
table and were **not** blanket-revoked. They are not SECURITY DEFINER, so RLS
still guards their tables, and a blind sweep could break a genuinely public
surface (an unauthenticated jackpot ticker reading a `*_bbj_*` function). They
drain in reviewed batches; each joins the lock list as it is revoked. The
CRITICAL gate holds at 0 throughout.
