# Club Agent Private Data Boundaries

Sub-agents, agents and super agents have no whole-club operational data authority. The existing service-role API handlers now use one active owner/co-owner/admin membership predicate for privileged club analytics, player sessions, settlement history, anti-cheat, recommendations and administration. Suspended or inactive memberships cannot pass by retaining an old role name.

Agent dashboard and chip-flow reads derive the current recursive downline from the database using the authenticated actor. The chip-flow response omits unrelated transaction counterparties, and pending cashouts are intersected with the current downline after reassignment. A scope error or malformed response fails closed.

The regression tests exercise every role, inactive membership and malformed scope; actual session and analytics handlers are invoked to prove they refuse agents before a private service-role read. The existing build safety workflow runs the tests on future changes. Club Arena separately owns the corresponding database, roster, bank and assignment controls.

The task's archived checkpoint records source, checks, protected merge, production publication and live verification separately.
