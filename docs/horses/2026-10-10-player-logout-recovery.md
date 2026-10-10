# Player Logout Recovery

The player control previously retained a logout operation only in React state.
Losing its response and reopening the panel generated a new decision, allowing
a retry to end a session opened after the original logout. The new control
persists the operator, target, reason and original operation before dispatch.
Reloaded decisions read their requester-scoped durable receipt first. An absent
receipt requires an explicit same-key retry and current write permission.
Unavailable reads and malformed stored decisions retain their original bytes;
they cannot authorize a new decision. A completed receipt remains readable
after write permission is revoked. POST authorization and transaction semantics
are unchanged; no migration is required.

The actual React control regression covers completed/absent receipts with
revoked write permission, explicit retry, malformed storage and unreadable
outcomes. The connected API/helper checks cover requester/action scoping,
identity mismatches and delayed scope changes. Focused existing Phase4 tests
also pass. No production mutation was used. Evidence is retained in
`/Volumes/SmarterArchives/agent-evidence/stable-admin-scope-audit-20261010/restrictions-stops/`.

Approval-gated sanctions had the same reload gap: their sole execution key was
held in React state even though the approvals queue deliberately cannot execute
sanctions. The Players panel now persists each original actor-bound draft before
POST, retains pending approvals and unknown results, restores them on reload,
and reads the original outcome before a separately enabled same-key retry. It
cannot dismiss an uncertain decision or create another sanction for that target
while one remains retained. Completing one decision preserves other targets.
The actual Players panel regression fails on the original source and passes on
the repaired source; its helper tests cover immutable payloads, multiple retained
approvals, malformed storage and permission loss. The final focused set passes
132 tests with no skips after the mounted-view and expired-decision checks;
scoped ESLint passes.


Follow-up panel boundaries: the sanction scope also belongs to the mounted Players panel. A deferred completed receipt after unmount must not notify, refresh or remove the original stored intent. The actual regression fails with the prior account-only scope and passes with the view fence.

Expired retained decisions are released only explicitly. The original POST must return the named 400 `expiry_in_the_past` refusal, followed by a fresh actor/op/action read proving no committed operation and an actor/op/kind approval read proving absent or exactly matching rejected/expired approval. Pending, approved, executed, mismatched and unknown approval states retain the original handle. Release repeats this proof; a receipt which commits in the meantime takes its ordinary receipt recovery path. Permissions and transport failures never enable release. No approval is executed or cancelled by this control.
