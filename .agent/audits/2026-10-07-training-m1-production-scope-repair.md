# Original Training M1 Production Scope Repair

Source-only response to provisioning run 37573144532, which failed before
mutation because its single Training HMAC entry also targeted non-Production
environments. This credential is distinct from all Horse V31 principals.

The maintained manual workflow still owns provisioning. The helper now validates
the bounded complete metadata inventory and permits either an existing Sensitive
Production-only rotation or separation of one Sensitive/encrypted shared entry.
Separation PATCHes only `target`, removing Production and preserving the provider's
existing non-Production value without decrypting, reading or rewriting it. Exact
metadata readback must pass before a fresh Sensitive Production-only POST. POST
does not use upsert and cannot overwrite another entry. Unrelated metadata must
remain unchanged through both operations. Overlapping, branch-scoped, malformed,
duplicate or unknown target scopes fail before secret generation.

Official API references checked 2026-10-07:

- https://vercel.com/docs/rest-api/projects/edit-an-environment-variable:
  `target` and `value` are separate optional PATCH fields.
- https://vercel.com/docs/rest-api/projects/create-one-or-more-environment-variables:
  optional `upsert=true` permits overwrite; this helper deliberately omits it.

RSA ciphertext and a sanitized operation receipt are fsynced before any provider
mutation. Every mutation's attempted stage is durably recorded first. Provider
response bodies are discarded for PATCH/POST; receipts never include opaque
provider values or plaintext credentials. Failure retains an unknown result and
never retries. In particular, a timed-out create must be reconciled by the owning
controller, not repeated based on an absent or delayed metadata result.

The explicit recovery classifier can continue a missing Production entry only
with a retained `scope_separated` / `scope_patch_verified` receipt and exact
current metadata, before any create attempt. Unknown/create-attempted receipts
cannot authorize another POST. The normal workflow currently has no recovery
receipt input; any exceptional continuation needs that explicit supported input
wired by the controller, rather than silently guessing from Preview-only state.

Focused hermetic coverage includes encrypted/shared scopes, value-preserving
target-only requests, durable pre-mutation state, exact readback, partial failures,
unknown POST outcomes, overlapping/invalid scopes and recovery eligibility.
No provider change, credential rotation, solve, database write, commit or
publication was performed by this source-only task.
