# Audit: /hub/avatars deep dive + fleet-wide serverAuth import regression

Date: 2026-07-29
Agent: Claude (Cowork cloud session)
Scope requested: line-by-line review of https://smarter.poker/hub/avatars, fix all
bugs/stubs/gaps/regressions, verify wiring into Club Arena and training games.

## Findings and fixes

### 1. DB: set_active_avatar was unreachable and never synced profiles (FIXED, applied to prod)

- The 20260429 compliance sweep revoked EXECUTE on `set_active_avatar` from
  `authenticated`, so EVERY avatar equip from the client failed with permission
  denied. `user_avatars` contained exactly one row ever — the feature never
  worked in production.
- The function also never wrote `profiles.avatar_url`, which is the field Club
  Arena (useUserStore / IdentityDNA / MasterBus), the training tables (cached
  header user) and the header actually read. Equipping an avatar therefore
  could never propagate anywhere.
- Fix (applied via Supabase MCP `apply_migration`, and saved as
  `supabase/migrations/20260729_fix_set_active_avatar_grants_and_profile_sync.sql`):
  recreated with an `auth.uid() = p_user_id` guard, a new optional
  `p_image_url` param, `profiles.avatar_url` sync, EXECUTE granted to
  `authenticated` + `service_role` only. Old 5-arg overload dropped.

### 2. Unlock logic: every free avatar reported locked (FIXED)

`isAvatarUnlocked` tested `avatarId.startsWith('free_')` but the library ids
are hyphenated (`free-animal-001`), so all 25 free avatars fell through to the
`avatar_unlocks` table (seeded with legacy `free_*` ids) and came back locked.
Preset selection was broken for every user. Now tier-based: FREE tier always
unlocked; VIP tier unlocked for VIP members or an explicit unlock row. A
legacy-id resolver (`resolvePresetAvatar`) maps old `free_shark`-style ids.

### 3. Gallery lock computation: case mismatch locked all 75 avatars for non-VIP (FIXED)

`AvatarGallery` compared `a.tier !== 'free'` against the library's uppercase
`'FREE'`/`'VIP'`, marking every avatar VIP-locked for free users. Now uses the
service's tier-aware `isLocked`. Also fixed: logged-out infinite
"Loading Avatars...", custom-slot refresh gated on VIP (free users have a slot
too), unlocked/locked counts in the subtitle.

### 4. edit-avatar API: ReferenceError on every request (FIXED)

`pages/api/avatar/edit-avatar.js` referenced undeclared `_authErr`/`_authUser`
— every authenticated avatar edit 500'd.

### 5. Fleet-wide: serverAuth imports missing on main / wrong depth locally (FIXED)

A getUser codemod refactored ~260 nested API routes to call
`getServerUserWithFallback(...)` but the import line never landed on origin —
every one of those routes throws `ReferenceError: getServerUserWithFallback is
not defined` at runtime on production. A local follow-up codemod
(`fix-all-getuser.js`, 2026-07-29 05:04 local) inserted the import at a FIXED
depth (`../../src/...`), which is wrong for every nested route and would have
broken the next build.

Fix shipped in this push, three classes (verified per-file by git blob SHA
against origin/main):

- identical-to-main (44 files): already fixed on origin, skipped
- import-only delta (169 files + the 3 pages/api/avatar routes): local file =
  main + depth-correct import; pushed local content
- diverged beyond the import (48 files): local has OTHER uncommitted in-flight
  work not mine to ship. For these the pushed content was derived from
  origin/main's own blob + a depth-correct serverAuth import inserted
  (require() style for CJS files), touching nothing else. Local divergence is
  left intact on disk for its owning agents.

### 6. Club Arena links pointed at a dead page (FIXED)

`AvatarService.getHubAvatarUrl()` and ProfilePage's "Change Avatar" opened
`smarter.poker/hub/avatars-complete`, which no longer exists (404). Updated
both in the Smarter-Poker-Club-Arena repo to `/hub/avatars`, and added
permanent redirects in next.config.js (`/hub/avatars-complete`,
`/hub/avatars-standalone` → `/hub/avatars`) so already-deployed CA bundles keep
working. CA frontend picks up the source change on its next build/sync.

### 7. Wiring: equips now propagate everywhere (FIXED)

`selectPresetAvatar` passes VIP status + image URL; RPC syncs
`profiles.avatar_url`; custom-avatar path also updates profiles client-side;
both paths dispatch `profile-updated` + BroadcastChannel sync. Header, Club
Arena, and training-game hero seats all read from what is now kept in sync.

## Deferred / notes

- `tmp/serverauth-fix-bundle-20260729.tgz` on Dan's Mac is a transfer artifact
  of this session; safe to delete (device sandbox cannot rm).
- `src/config/avatar-pool.js` (getHeroAvatar/getVillainAvatars) is dead code —
  no importers; left in place.
- `avatarsCompleteStore.js` / `avatarsStandaloneStore.js` are orphaned Zustand
  stores for removed pages; left in place (no importers, no build impact).
- The 48 diverged API files still carry local-only uncommitted changes on the
  Mac from other in-flight agent work; their serverAuth import fix is on main,
  the rest of their divergence needs its owning agent to ship.
