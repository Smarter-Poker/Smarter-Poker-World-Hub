# Phase 1 API contracts (shared between route agents and client agents)

Every /horses route is wrapped by src/lib/horses/operatorRoute.js:
- success: 200 { success: true, ...payload, requestId }
- failure: { success: false, error, code, requestId } (error is operator-safe text, never database text)
- 405 carries an Allow header; 401 unauthorized; 403 permission_denied with { permission }; 429 rate limited; 503 service_role_missing when the server is misconfigured.

Existing response field names MUST be preserved (add, never rename). New or changed list sections return the paged shape:
  { rows, total, limit, offset, hasMore }
alongside any legacy field name the client already reads (keep both until Phase 9).

New contracts introduced in Phase 1:
1. GET /api/horses/club-arena-admin?section=tickets&limit=&offset=&status=&q=
   -> { success, rows: [ { ...live_help_tickets row, reporter: { id, username, display_name, avatar_url } | null } ], total, limit, offset, hasMore }
   status in open|in_progress|resolved|closed|all (default all). q searches subject/description.
2. Every list section of club-arena-admin (clubs, unions, users search, cashouts, members, agents, tables, sessions, flags) accepts limit/offset and returns total (+ hasMore); default limit 50, max 200. Clubs default 200 for the overview name map is replaced by a full name lookup for the ids on the page.
3. GET /api/horses/admin-reviews?q= searches server-side (ilike on review_text and reviewer username); rating validated 1..5; review_id validated uuid on DELETE/PATCH.
4. POST /api/horses/stable-admin { action: 'audit_log', page, limit, actionPrefix, adminId, targetId, from, to } -> { rows, total, page, limit, actors } where actors comes from a cached distinct query (60s). Rows include details, before_state, after_state.
5. GET /api/horses/mint?section=ledger&limit=&offset= -> { rows, total, limit, offset, hasMore } (legacy field names kept).
6. POST /api/horses/stable-admin bulk actions accept up to 500 ids per call; the client chunks larger selections.
7. POST /api/club-arena/horse-launch { action: 'launch_all' | 'shutdown' } -> 410 Gone { code: 'retired', error: 'Fleet Seeding Is Owned By The Engine (HorseFleetManager); This Button Was Retired In Phase 1' }. { action: 'status' } still works.
8. GET /api/horses/grinder-stats is rate limited (read) and paginates its roster: ?limit&offset -> roster { rows, total, ... } plus the legacy fields.
9. POST /api/horses/trigger-pipeline and POST /api/horses/grinder-stats club actions return 501 { code: 'not_built' } through the wrapper; the client shows an honest Not Built Yet state, no disabled buttons.

## Review addendum (2026-09-02, after the adversarial review of Phase 1)

10. Row caps must never shrink silently. Route defaults for lists the console renders WITHOUT a pager go back to the original caps (clubs 200, unions 100, cashouts 100, members 300, agents 200, tables 200, ledger 200, mint targets 500), `max` is 500 for those, and the client sends `limit` explicitly (`limit=200`, `limit=300` for members) so the cap is visible in code. Every list response carries `total` (exact where cheap; `count: 'planned'` on tables over ~1M rows: diamond_transactions, chip_transactions, hand_history) and `truncated: total > rows.length`. The client renders "Showing N Of Total" wherever `truncated` is true.
11. club-arena-admin `section=club` returns `memberChipTotal` (server-side sum over ALL members via chunked reads of chip_balance) and `memberCount`; the client uses them for "Chips On Books" and the sub-nav counts instead of summing the page.
12. grinder-stats GET accepts `limit` (max 500) and `offset`; the roster is paged server-side and the client pages it with the Pager (no client-side slicing of the full persona list). Fleet totals (`currentlyPlaying`, `totalHands`, `totalProfit`) are WHOLE-FLEET, computed from chunked reads (200 ids per `.in()`) of only `hands_played`/`total_profit`/seat rows for every horse profile id; `totalsScope: 'fleet'`.
13. horse-launch `status` returns BOTH the new names (`totalHorses`, `seatedHorses`, `activeTables`, `activeTournaments`, `checkedAt`) and the legacy aliases the panel read (`cashTables`, `horsesSeated`, `tournaments`, `timestamp`); the client reads the new names.
14. Audit action vocabulary: the console's Audit tab filter groups map to ARRAYS of prefixes [new, legacy] and the `audit_log` action accepts `actionPrefixes: string[]` (OR of `like` filters) in addition to `actionPrefix`. Legacy rows stay visible; nothing is backfilled.
15. hg-reports / hg-appeals return `total: null` when the RPC provides no count (never a fabricated number), plus `hasMore` computed as `rows.length === limit`. Pager treats `total === null` as unknown and enables Next from `hasMore`.
16. `failedSources` entries carry a generic per-source message (`'<source> read failed'`) and the request id; raw database text is logged server-side only.
17. Errors thrown from Supabase inside a route must not reach the wrapper raw: routes map known business failures (duplicate key -> 409 conflict with a Title Case message, not found -> 404, permission -> 403) and let anything else become a scrubbed 500.
18. toCsv: the formula-injection guard applies to STRING cells that start with = + - @ and are not numeric; numbers export as numbers.
19. execute-sql writes exactly ONE audit row per committed mutation, through auditOperatorAction, with the real profile role; the older direct insert for commits is removed (dry-run/read logging unchanged).
20. auditOperatorAction never throws: buildAuditRow runs inside the try.
