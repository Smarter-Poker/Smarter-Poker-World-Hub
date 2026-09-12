# GDPR deletion respects an explicit financial refusal

Both staged deletion routes previously continued to `auth.admin.deleteUser` when `fn_delete_user_gdpr` returned its actual financial refusal, `{ success: false, error: 'financial_precheck_failed', precheck: ... }`. Their existing check inspected only `summary.status`; that refusal has no status or request ID. Missing request ID skipped the completion marker but did not stop provider deletion.

The two existing refusal predicates now also reject `summary.success === false`. The existing HTTP 500 response, refusal detail, transport-error handling and failed-status handling are preserved. The current legitimate SQL summary contains `request_id`, `user_id`, `requested_by` and `anonymized_columns`, with neither status nor success. It remains accepted; the original target and request identity continue through the existing provider and completion paths.

This is G8-ACCOUNT-AUTH-04 and documented urgent exception G8-URGENT-GDPR-REFUSAL-0001 under the Rev4 G8 prompt, independently scoped by review0048. G8 assigned the sole implementation writer and retains independent candidate acceptance and final protected integration/release. Generic repository instructions to push immediately or stop at a pull request do not replace those program gates. The candidate begins at World Hub `57e63abfc85cd935d78292f326791a514288c963`; current SQL was captured read-only at 2026-09-12 03:47:14 UTC. No SQL changes are part of this repair.

`__tests__/gdpr-financial-refusal.test.mjs` executes the complete, unmodified-in-memory source of both real Pages API handlers using Node SourceTextModule. All imports, authentication, rate/MFA checks, RPCs, audit calls and provider boundaries are local stubs. The module receives an empty environment and no live SDK or credentials. These tests prove handler control flow, not real JWT verification, database rollback, provider cascades or deployed behavior.

Run the focused suite with:

```sh
node --experimental-vm-modules --test __tests__/gdpr-financial-refusal.test.mjs
```

The original handlers produced 29 passes and four expected failures across 33 cases: the exact financial refusal and the explicit-false/positive-status combination reached the provider stub once in each route, where zero calls were required. The candidate passes all 33. The suite preserves status-less valid success with one correct-target deletion and the original completion ID, transport and failed-status refusals, method/auth/confirmation gates, admin role/MFA/target/reason gates, self rate limits, provider partial failures, and completion-marker error behavior. No financial or provider operation was executed.

The suite is included in the existing CHECK 8 Node test list in `.github/workflows/build-safety-gate.yml`, under a separate one-line G8 scope addition. Focused JavaScript parsing and no-undefined-name linting pass. The repository-wide typecheck was attempted in the new, unprovisioned worktree and failed, including missing Playwright, Node and other dependency declarations. It is not a full typecheck pass; no dependency install or shared dependency modification was performed. Protected CI and the production build remain G8 integration prerequisites.

The change is deliberately limited to explicit refusals. It does not certify arbitrary malformed or mismatched receipts, complete financial-precheck coverage, cross-provider atomicity, every account-deletion workflow, retention policy, successful cascading destruction, or the overall G5 foundation. Existing database NOT NULL, append-only and obligation guards remain independent protections. Deployment and served-route proof remain required before this containment is called delivered.
