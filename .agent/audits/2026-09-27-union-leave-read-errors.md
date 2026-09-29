# Union Leave Reads Preserve Unknown Outcomes

The mounted Club Arena union workspace calls `manage-union` with the read-only
`list_leave` action. A returned database error previously became HTTP 200 with
an empty list, hiding pending requests during an outage. The handler now uses
its existing error path for returned errors and malformed list responses;
successful empty arrays and populated lists retain their response shape.

The endpoint's caller authorization, union and pending-status predicates,
descending request order, rate limit, contract validation and read-only
idempotency exemption are unchanged. No command, financial behavior or schema
changes are included.

The actual handler and actual Zod contract run in an isolated fixture that
models only external I/O. The regression fails against the previous handler
for returned errors and malformed rows. It also checks success, repeat reads,
owner fallback, foreign-union refusal, auth, method, validation and rate limits.
The existing required CHECK 8 imports this suite through `_test-guards-exist`.
This is a local fault-injection proof; no production outage or financial action
is induced.
