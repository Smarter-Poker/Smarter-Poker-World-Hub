# Stable Admin Permission Matrix

Effective 2026-10-05. Canonical sources:
`src/lib/horses/permissions.js`, `src/components/horses/tabRegistry.js` and the
permission declaration on each owning route.

## 1. Resolution Rules

- Legacy profile roles `god`, `superadmin` and `admin` retain every permission.
- Named roles reach an account through an active `ca_operator_grants` row, not
  through a same-named string in `profiles.role`.
- Named grants are additive until `ca_operator_policy.enforce_named_roles` is
  enabled. They never silently subtract the legacy recovery set.
- `owner` is the named full set. `operations`, `finance`, `compliance`,
  `support` and `read_only` are job-shaped subsets.
- Unknown permission state is `null`; it is not an empty grant set. Explicitly
  empty means no permission.
- Opening a tab grants no mutation authority. Every write is checked again by
  the route and, where applicable, the database function.
- Approval decisions require the permission of the underlying operation, not
  merely access to the Approvals tab.

## 2. Role By Permission

| Permission | Owner | Operations | Finance | Compliance | Support | Read Only | God | Super Admin | Admin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `console.read` | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `audit.read` | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `fleet.read` | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `fleet.write` | Yes | Yes | No | No | No | No | Yes | Yes | Yes |
| `players.read` | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `players.write` | Yes | Yes | No | Yes | Yes | No | Yes | Yes | Yes |
| `support.write` | Yes | Yes | No | No | Yes | No | Yes | Yes | Yes |
| `moderation.write` | Yes | Yes | No | Yes | No | No | Yes | Yes | Yes |
| `clubs.read` | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `clubs.write` | Yes | Yes | Yes | No | No | No | Yes | Yes | Yes |
| `money.read` | Yes | Yes | Yes | Yes | No | Yes | Yes | Yes | Yes |
| `money.write` | Yes | No | Yes | No | No | No | Yes | Yes | Yes |
| `cashier.write` | Yes | No | Yes | No | No | No | Yes | Yes | Yes |
| `promo.write` | Yes | Yes | Yes | No | No | No | Yes | Yes | Yes |
| `catalog.write` | Yes | Yes | No | No | No | No | Yes | Yes | Yes |
| `content.write` | Yes | Yes | No | No | No | No | Yes | Yes | Yes |
| `settings.write` | Yes | Yes | No | No | No | No | Yes | Yes | Yes |
| `incidents.ack` | Yes | Yes | No | Yes | No | No | Yes | Yes | Yes |
| `avatars.generate` | Yes | Yes | No | No | No | No | Yes | Yes | Yes |
| `gdpr.erase` | Yes | No | No | Yes | No | No | Yes | Yes | Yes |
| `sql.execute` | Yes | No | No | No | No | No | Yes | Yes | Yes |
| `admin.manage` | Yes | No | No | No | No | No | Yes | Yes | Yes |

## 3. Top-Level Tab Admission

| Tab | Permission | Tab | Permission |
| --- | --- | --- | --- |
| Social Horses | `fleet.read` | Fleet Command | `fleet.read` |
| Pipeline | `fleet.read` | Settings | `settings.write` |
| Statistics | `money.read` | Merch Catalog | `console.read` |
| Promo Codes | `console.read` | Economy | `money.read` |
| The Mint | `money.read` | Anti-Abuse | `players.read` |
| Club Arena | `clubs.read` | Bug Reports | `players.read` |
| Geeves KB | `console.read` | Reviews | `console.read` |
| Scrapers | `console.read` | Audit Log | `audit.read` |
| Staff And Roles | `console.read` | Approvals | `console.read` |
| Players | `players.read` | Integrity | `players.read` |
| Live Floor | `clubs.read` | Tournaments | `clubs.read` |
| Cashier | `money.read` | Rake | `money.read` |
| Platform Operations | `console.read` | SQL Console | `sql.execute` |
| HG Moderation | `players.read` | Hand Reviews | `fleet.read` |

The retired `grinder` bookmark resolves to Fleet Command. The former SQL,
Home Games moderation and hand-review subpages redirect with HTTP 307 to their
top-level tabs while preserving unrelated query parameters.

## 4. Write Boundaries

| Capability | Required Permission | Additional Gate |
| --- | --- | --- |
| Fleet policy change | `fleet.write` | Material changes may require maker-checker approval. |
| Mint or burn chips | `money.write` | Unique operation ID, policy threshold and maker-checker. |
| Fund a club | `money.write` or owning route's exact finance permission | Idempotent `fn_ca_fund_club` path and maker-checker. |
| Approve/cancel a cashout | `cashier.write` | Queue epoch/scope guard and maker-checker threshold. |
| Restrict or sanction a player | `moderation.write` | Reason/state rules; confiscation also needs `money.write`. |
| Acknowledge or release incident ownership | `incidents.ack` | Append-only overlay; source incident health and status stay unchanged. |
| Sign a daily financial close | `money.write` | Exact manifest hash, reviewed exceptions and maker-checker policy. |
| Edit a player record | `players.write` | Field allowlist and audit. |
| Resolve/assign support work | `support.write` | Ticket state and audit. |
| Grant/revoke operator role or edit policy | `admin.manage` | Reason, final-admin guard and audit. |
| Moderate reviews, Geeves or Home Games | `moderation.write` | Durable target ID and audit. |
| Erase a data subject | `gdpr.erase` | Confirmed target and durable audit. |
| Execute operator SQL | `sql.execute` | Restricted server route and audit. |
| Manage clubs or union applications | `clubs.write` | Platform-owned operation only; Club Arena keeps local authority. |
| Publish promo/catalog/content/settings changes | Matching `promo.write`, `catalog.write`, `content.write` or `settings.write` | Route validation and audit. |
| Generate avatars | `avatars.generate` | Bounded fetch, constant-time secret check and validated content. |

## 5. Maker-Checker Matrix

Kinds are `mint`, `burn`, `fund_club`, `cashout`, `fleet_policy`, `sanction` and
`daily_close`. The request is bound to kind, target, operation identity and payload
fingerprint. Rejection, expiry or mismatch cannot release the operation.
Self-approval is refused unless the configured alone rule applies and the
database proves there is no second eligible approver. Approval is not execution:
the owning route records execution exactly once after the protected action.

## 6. Verification Checklist

For every role change or authorization incident:

1. Read the active grant and policy row.
2. Resolve the effective permission set through the canonical resolver.
3. Confirm the tab is visible or absent as expected.
4. Call the protected route with an allowed and a refused identity.
5. For database-self-gated behavior, repeat through PostgREST. A direct SQL
   call as `postgres` is not authorization proof.
6. Confirm the audit record names actor, role, request, target, before and after.
