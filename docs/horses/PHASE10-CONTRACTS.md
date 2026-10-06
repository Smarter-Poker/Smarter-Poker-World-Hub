# Stable Admin Phase 10 Contracts

Status: implementation contract, 2026-10-05

Phase 10 closes the ten-phase `/horses` programme with verified operating
evidence and durable operator documentation. It does not invent new authority,
silently turn on dormant policy switches, move chips, or reinterpret an older
phase's explicit limitations.

## 0. Completion Boundary

Phase 10 is complete only when all six deliverables named in
`STABLE-ADMIN-OVERHAUL-PLAN.md` exist and agree with the shipped application:

1. read-only end-to-end production verification;
2. an operator runbook for all 28 top-level tabs and all 10 Club Arena sections;
3. a permission matrix generated from the canonical permission vocabulary;
4. a GLI-19 disclosure and fleet-register operating record;
5. a final F, H, P, I, O, E, C, A and X gap re-score;
6. a current handoff with exact source, database, deployment and live evidence.

Documentation is not allowed to upgrade an unverified condition to complete.
Every current fact carries a source path or a dated production observation.
Historical handoffs remain evidence only.

## 1. Safety And Authority

- Horses are players. Identification and fleet plumbing are permitted; exclusion
  from a player rule, report, total, payment or integrity check is forbidden.
- The console is the platform-operator back office. Club, union and agent
  authority remains in Club Arena unless an existing operator route explicitly
  owns an action.
- Read-only verification performs no mutation. It never uses real chips, opens
  a seat, changes a policy, acknowledges an incident or synchronizes a register.
- `ca_operator_policy.approvals_enabled`, `enforce_named_roles` and
  `restrictions_enforced` retain their production values. Phase 10 documents
  them and never flips them.
- UI visibility is not authorization. Permission evidence must cover the tab,
  route and, where present, database function boundary.
- No secret, session token, personal account or environment-file value is
  copied into evidence.

## 2. Source-Of-Truth Documents

The Phase 10 package is:

- `STABLE-ADMIN-OPERATOR-RUNBOOK.md`
- `STABLE-ADMIN-PERMISSION-MATRIX.md`
- `STABLE-ADMIN-GLI19-DISCLOSURE.md`
- `STABLE-ADMIN-FINAL-GAP-RESCORE.md`
- `HANDOFF-2026-10-05-phase10.md`
- `docs/HANDOFF_CURRENT_STATE.md`, which points to the current handoff instead
  of presenting the 2026-09-04 Phase 3 snapshot as current.

`tabRegistry.js`, `permissions.js`, route wrapper declarations, database
migrations and the protected production revision remain the technical source
of truth. If a document and code disagree, code wins and the document must be
fixed in the same delivery.

## 3. Documentation Contract Tests

The Phase 10 documentation test must fail when:

- any visible registry tab is absent from the runbook;
- a tab's opening permission differs from `tabRegistry.js`;
- any canonical permission or named/legacy role is absent from the matrix;
- any gap ID from the original plan is absent from the re-score;
- the GLI-19 document omits the never-delete retirement rule, source tables,
  owner entity, funding source or attestation fields;
- the handoff omits any of the ten phases or conflates tested, merged,
  installed, published and live-verified states.

## 4. Production Verification Contract

Production verification is performed after the Phase 9 merge and exact Phase 9
database migration installation. It records:

- protected merge revision and applicable GitHub checks;
- Vercel deployment ID, READY state and selected Git revision;
- `/api/health` served revision, with ancestry proof if it is a descendant;
- authenticated `/horses` shell admission;
- each permitted tab's URL, selected tab, tabpanel and chunk-load result;
- desktop and 375px body-overflow result;
- the three legacy URL redirects;
- unauthenticated refusal for protected APIs and safe read-only responses for
  the operator session;
- exact migration ledger version, post-image hash, function owner, security
  mode, grants and PostgREST allowed/refused permission behavior.

A newer protected production revision may satisfy the source proof only when it
contains the merged Phase 9 and Phase 10 revisions and the scoped files are
unchanged or intentionally superseded.

## 5. Honest Gap Scoring

The final re-score uses four states:

- `Resolved`: the intended capability is implemented and evidenced.
- `Resolved Elsewhere`: the capability deliberately remains in Club Arena or
  another named owning surface, with a working deep link or evidence path.
- `Partial`: useful capability exists but the original research item is not
  completely met. The remaining boundary is named.
- `Open`: no working implementation was found.

Phase completion does not permit renaming a partial item to resolved. The
handoff carries every partial and open item forward as product debt without
pretending it was part of the Phase 10 documentation delivery.

## 6. Release Gate

1. Phase 9 is merged, its migration is installed and read back, Vercel is READY
   and affected live behavior is verified.
2. Phase 10 source-contract tests and focused lint pass.
3. The Phase 10 branch is rebased from the protected Phase 9 descendant so its
   diff contains Phase 10 only.
4. Protected checks pass and the Phase 10 PR is squash-merged.
5. The production deployment is READY and `/api/health` serves the merge or a
   proven descendant.
6. The current handoff is updated with final immutable identities and no
   pending delivery step is described as complete.
