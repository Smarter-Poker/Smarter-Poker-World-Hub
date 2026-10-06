# GLI-19 Simulated-Player Disclosure And Fleet Register

Effective 2026-10-05. This document describes the Stable Admin disclosure
record and its operator procedure. It is an engineering and operating record,
not a representation that a regulator has certified the platform.

## 1. Disclosure Statement

Every account in the Stable Admin fleet register is a simulated player operated
by the platform and disclosed in the operator console. Simulated players use the
same game rules, timers, seats, buy-ins, wallets, payouts, integrity checks and
reporting paths as human players. They are identified so an operator can audit
the fleet; identification never authorizes exclusion or different treatment.

The application returns this disclosure with the register:

> Every Account Listed Here Is A Simulated Player Operated By The Platform And Disclosed Under GLI-19.

## 2. Authoritative Record

`public.ca_horse_fleet_register` is the durable register. Its contract is
defined by `20260903222000_ca_horse_fleet_command.sql` and includes:

| Field | Meaning |
| --- | --- |
| `horse_id` | Durable player profile ID and primary key. |
| `disclosed` | Whether the account is currently marked disclosed. |
| `owner_entity` | Platform entity responsible for the simulated account. |
| `funding_source` | Named source of its bankroll. Funding still uses the platform ledger. |
| `created_at` | Source account creation time. |
| `registered_at` | Time the disclosure row entered the register. |
| `retired_at` | Retirement time when the source account is no longer active as a horse. |
| `note` | Bounded operator context. It is not a substitute for audit history. |

The register synchronizes from the authoritative player profile set where
`is_horse` identifies a simulated account. It never deletes a disclosure row.
When a previously registered account leaves the active source set, synchronization
sets `retired_at`. Historical existence remains answerable.

## 3. Related Evidence

| Evidence | Source | Operator Question |
| --- | --- | --- |
| Effective fleet policy | `ca_horse_fleet_policy`, `fn_ca_fleet_policy_effective` | What seating policy governed this scope? |
| Current state | `ca_horse_fleet_state` | Where was the player reported, with what state and stack? |
| Fleet pulse | `ca_horse_fleet_heartbeat` | Was the fleet manager publishing current state? |
| Isolation | `fn_ca_fleet_isolation_report` | Did a simulated player hold open seats in conflicting scopes? |
| P and L | `fn_ca_fleet_pnl` | What was the player's traceable result by scope and period? |
| Player record | `profiles` and Player 360 sources | What durable account and lifecycle facts exist? |
| Funding | chip ledger and approved treasury RPCs | Did bankroll enter through an authorized, idempotent path? |
| Integrity | Stable Admin Integrity findings and cases | Was the player subject to the same detection and review? |
| Operator history | canonical admin audit log | Who changed policy or synchronized the register, and why? |

## 4. Funding And Ownership Rules

- `owner_entity` and `funding_source` are mandatory disclosure facts, not free
  marketing labels.
- The console never calls `mass_fund_horses` or writes a wallet directly.
- Funding uses the existing treasury/ledger authority and retains operation
  identity, before/after balance and actor evidence.
- A simulated player earns and receives the same prizes, rake attribution,
  points, refunds, jackpots and correction payments as a human player.
- A platform defect is corrected through the same idempotent reconciliation
  path. Settled player history is never rewritten to make the fleet appear even.

## 5. Operator Procedure

### Daily read-only review

1. Open Fleet Command and confirm the heartbeat/freshness disclosure.
2. Compare active source count, registered count and retired count.
3. Confirm every active simulated account has owner entity, funding source,
   creation time and disclosure state.
4. Read the isolation report and investigate every nonzero result.
5. Read anomaly and P and L evidence beside the same period's human evidence.
6. Record stale, missing or divergent sources as incidents. Do not synchronize
   merely to remove a red banner.

### Controlled synchronization

1. Establish that the source profile set is authoritative and current.
2. Record the pre-sync counts and missing IDs.
3. Use the Fleet Command Sync action only with `fleet.write`.
4. Read the returned inserted, updated and retired counts.
5. Reload the register and verify the exact post-image.
6. Confirm the audit entry. A synchronization that has no audit record is not
   complete.

### Retirement

Never delete a register row. Retire the source account through its owning
lifecycle and let synchronization stamp `retired_at`. Preserve owner, funding,
creation and registration facts indefinitely unless a later binding retention
policy explicitly replaces this rule.

## 6. Attestation Record

An attestation is evidence, not a checkbox. Record:

- attesting operator ID and effective role;
- UTC time and production revision;
- active, registered, retired and missing counts;
- owner-entity and funding-source completeness;
- isolation result count;
- heartbeat/freshness state;
- unresolved exceptions with durable IDs;
- the audit request ID.

Attestation must not claim that gameplay is fair merely because the roster is
complete. Gameplay equality, funding conservation, anomaly evidence and case
handling are separate controls and must retain their own proof.

## 7. Forbidden Shortcuts

- No `is_horse = false` exclusion from reports, integrity or payments.
- No deletion of retired register rows.
- No direct wallet update or unlogged bulk funding.
- No green status produced by clearing stale/gap evidence.
- No register completeness claim from a client-side page count.
- No regulatory-certification claim based only on this engineering record.
