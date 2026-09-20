# Club Arena Operations API — `pages/api/club-arena/*`

**Tier 3** of the Club Arena architecture (per `Smarter-Poker-Club-Arena/.agent/architecture/deploy-paths.md`).

This directory contains the **67 REST endpoints** that handle every non-realtime concern of the Club Arena product: cashier flows, club admin, agent operations, union management, tournaments, marketplace, settlement, anti-cheat, and player operations.

These are **NOT game-engine endpoints**. The realtime poker engine lives at `engine.smarter.poker` (Hetzner) and uses WebSocket. These REST endpoints are how the player frontend (Vite app at `club.smarter.poker`) and admin/management surfaces talk to the persistence layer.

---

## Why this directory exists in `Smarter-Poker-World-Hub` (not `Smarter-Poker-Club-Arena`)

Three good reasons:

1. **World Hub already owns the user/auth surface.** Every Club Arena player's session, JWT, and Supabase context comes from World Hub's auth flow. Putting cashier and admin endpoints here means they reuse the same `serverAuth.js` + `supabaseServerClient.js` wrappers without cross-repo dep inversion.
2. **Operations endpoints are CRUD, not realtime.** They belong on Vercel's serverless, not on the Hetzner game-server box. Auto-deploys, faster iteration, no SSH dance.
3. **The pattern matches industry standard.** ClubGG splits the realtime tournament engine from the club-management web app the same way. PokerBros has a separate REST API behind their game client. WPT Poker has the casino-management dashboard on a different stack from the table runtime.

---

## Endpoint inventory (67 routes, grouped by concern)

### Cashier (8 endpoints)
- `accept-tos`, `buyin`, `cancel-my-cashout`, `cashier-info`, `cashout-history`, `request-cashout`, `approve-cashout`, `transfer-chips`

### Club management (10 endpoints)
- `create-club`, `delete-club`, `join-club`, `leave-club`, `manage-shop`, `manage-table`, `create-table`, `update-table-settings`, `lobby-ordering`, `table-templates`, `auto-close-tables`

### Settlement & rake (8 endpoints)
- `record-rake`, `rakeback`, `settle-period`, `settlement-history`, `distribute-chips`, `mint-chips`, `clawback-chips`, `promo-wallet`, `distribute-promo`

### Agent operations (4 endpoints)
- `agent-analytics`, `agent-credit`, `agent-dashboard`, `manage-agent`

### Union operations (4 endpoints)
- `union-application`, `union-dashboard`, `union-games`, `union-wallet`, `manage-union`

### Tournaments (3 endpoints)
- `tournaments`, `tournament-detail`, `tournament-cron`

### Marketplace (4 endpoints)
- `marketplace-items`, `marketplace-purchase`, `sticker-assets`, `generate-logo`

### Anti-cheat & audit (4 endpoints)
- `anti-cheat`, `audit-trail`, `player-notes`, `clawback-chips`

### Player operations (5 endpoints)
- `player-sessions`, `player-retention`, `player-chip-flow`, `my-hands`, `waitlist`

### Chat (3 endpoints)
- `chat`, `club-chat`, `table-chat`

### Health & analytics (5 endpoints)
- `health`, `club-health`, `club-analytics`, `smart-recommendations`, `bbj`

### Discovery (3 endpoints)
- `public-clubs`, `announcements`, `horse-launch`

### Misc admin (6 endpoints)
- `save-settings`, `table-chips`, `club-branding`, `club-leaderboard`

---

## Hard rules for this directory

1. **All routes must auth-gate or rate-limit.** No anonymous mutations. Use the standard `getServerUserWithFallback()` + `validateBearer()` pattern from `src/lib/auth/`.
2. **Method restrictions are mandatory.** GET for reads, POST for mutations. Reject other methods with 405. (Verified — `union-application`, `player-retention`, etc. all return 405 on GET.)
3. **No raw `supabase.auth.getUser()`.** Use the validated wrapper. (Pre-push hook blocks this team-wide.)
4. **No `export const runtime = 'edge'`.** These routes import `apiErrorHandler` and `supabaseServerClient` (both Node-only). The 81-route revert in commit `683a8d380` proved this.
5. **No business logic that belongs in the engine.** If the change affects gameplay state (active hand, betting round, pot calc), it goes in `Smarter-Poker-Club-Arena/server/src/`, not here.

---

## Where do I push X?

| If you change … | Edit here? |
|---|---|
| Cashier flow (buyin, cashout) | ✅ YES — `pages/api/club-arena/buyin.js` etc. |
| Club admin (create club, manage table) | ✅ YES |
| Agent dashboard data | ✅ YES |
| Union management | ✅ YES |
| Marketplace listing logic | ✅ YES |
| Rake recording (after a hand resolves) | ✅ YES — `pages/api/club-arena/record-rake.js` |
| Active hand state machine | ❌ NO → `Smarter-Poker-Club-Arena/server/src/engine/` |
| Player UI tooltip | ❌ NO → `Smarter-Poker-Club-Arena/src/` |
| World Hub home page | ❌ NO → `Smarter-Poker-World-Hub/pages/` (this repo's NON-club-arena pages) |

---

## Reference

- The dual-deploy reality of Tier 1 + Tier 2: `Smarter-Poker-Club-Arena/.agent/architecture/deploy-paths.md`
- URL push-path matrix: `.agent/architecture/url-map.md`
- Agent Rulebook: `.agent/architecture/ONE-SOURCE-OF-TRUTH.md`
- Master consolidation plan: `~/Documents/SMARTER-POKER-PLATFORM-CONSOLIDATION.md`
