# 2026-11-28 - Club Commander player pages: a scene for each page family

## What changed

`src/components/commander/CommanderPageShell.jsx` gives every
`/hub/commander/*` player page its #SMARTERDESIGN header scene. The 37 pages
used 13 scenes (24 reuses), and the matcher took the first entry whose prefix
matched any characters, so `/hub/commander/tournaments` showed the
`/tournament` scene and `/hub/commander/venues` showed `/venue`'s.

- `sceneFor` now takes the longest prefix that ends on a path segment.
- Each scene was chosen by looking at the library art: the poker-room lobby
  for the Commander home, the host's podium for check-in, the alert bell
  scene for notifications, felt and chips for the waitlist, the venue room and
  the map console for venues, a hand replay and a single-hand lab for hand
  history, the seat ring for a home game roster, the tilt-guard chair for
  responsible gaming, an order tablet for in-seat services, the tournament
  clock for the tournament clock, the bracket for a league's standings.
- 31 distinct scenes for 37 pages. The 6 reuses are subpages of one family
  (home games, squads, profile edit, venue detail).

## Law

`__tests__/hub-commander-smarterdesign.law.test.mjs`: every player page
resolves to a scene of its own family (never the home fallback), a scene is
never shared across families, prefixes match on a path segment, reuse is
capped at 7.

## Mapping

| Route | Scene |
|---|---|
| `/hub/commander` | `pnm-lobby` |
| `/hub/commander/check-in/[venueId]` | `toke-venues` |
| `/hub/commander/faq` | `rules` |
| `/hub/commander/hand-history` | `training-replay-theater` |
| `/hub/commander/hand-history/[handId]` | `training-hand-lab` |
| `/hub/commander/history` | `bankroll` |
| `/hub/commander/home-games` | `pnm-homegames` |
| `/hub/commander/home-games/[id]` | `pnm-homegames` |
| `/hub/commander/home-games/[id]/manage` | `training-session-dashboard` |
| `/hub/commander/home-games/[id]/roster` | `training-position-mastery` |
| `/hub/commander/home-games/create` | `training-table-wizard` |
| `/hub/commander/home-games/join` | `pnm-homegames` |
| `/hub/commander/leaderboard/[venueId]` | `preflop-leaderboard` |
| `/hub/commander/leagues` | `series` |
| `/hub/commander/leagues/[id]` | `training-community-leaderboard` |
| `/hub/commander/notifications` | `pnm-alerts` |
| `/hub/commander/player-card` | `staking-profile` |
| `/hub/commander/profile` | `training-player-profiles` |
| `/hub/commander/profile/achievements` | `training-achievements` |
| `/hub/commander/profile/edit` | `training-player-profiles` |
| `/hub/commander/profile/settings` | `settings` |
| `/hub/commander/rate-table` | `training-study-group` |
| `/hub/commander/responsible-gaming` | `training-tilt-guard` |
| `/hub/commander/rewards` | `store-rewards` |
| `/hub/commander/services` | `store-order-detail` |
| `/hub/commander/squads` | `training-study-group-finder` |
| `/hub/commander/squads/[id]` | `training-multiway-preflop` |
| `/hub/commander/squads/create` | `training-study-group-finder` |
| `/hub/commander/squads/join/[code]` | `training-study-group-finder` |
| `/hub/commander/tournament/[id]/clock` | `tournament-calendar` |
| `/hub/commander/tournament/[id]/my-status` | `training-tournaments` |
| `/hub/commander/tournament/[id]/register` | `preflop-tutorial` |
| `/hub/commander/tournaments` | `poker_mtt` |
| `/hub/commander/venue/[id]` | `pnm-venues` |
| `/hub/commander/venues` | `pnm-map` |
| `/hub/commander/venues/[id]` | `pnm-venues` |
| `/hub/commander/waitlist/[venueId]` | `pnm-live` |
