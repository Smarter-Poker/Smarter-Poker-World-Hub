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
