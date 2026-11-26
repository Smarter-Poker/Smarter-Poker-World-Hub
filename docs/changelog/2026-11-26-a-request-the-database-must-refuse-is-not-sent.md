# 2026-11-26 A request the database must refuse is not sent

Production Postgres logged these from World Hub code in the 24 hours to 21:45 UTC.

| Signature | Count | Root cause | Fix |
| --- | --- | --- | --- |
| `permission denied for table friendships` (GET) | 76 | The public profile page read friendships for signed-out visitors and crawlers; anon has no grant. | Friendships are read only for a signed-in viewer. The friend count still comes from profiles.friends_count. |
| `permission denied for table friendships` (PATCH, POST) | 4 | Friend accept did a direct UPDATE (no UPDATE grant) and an accepted reverse upsert (RLS admits pending inserts only). The notifications feed showed the friend as added while both writes were refused. | The friends page and the notifications feed accept via `accept_friendship`, which checks that the caller is the recipient. A declined accept rolls back or refetches. |
| `invalid input syntax for type uuid: "kings-club" / "crest-cert-..."` | 62 | /api/club-arena/spin-activation put a route slug into `clubs.id`. | The route answers 400 for a non-uuid clubId before the database. |
| `invalid input syntax for type uuid: "cash-<n>"` | 10 | /api/games/[slug] fell back to `game_registry.id = slug` for any slug. | The id fallback runs only for a uuid. |
| `invalid input syntax for type integer: "hand-nonexistent"` | 19 | /api/training/audit-hand-history looked up `hand_number` with any non-uuid id. | `hand_number` is asked about only for a whole number in integer range; other ids go to the synced records. |

Hardening: `__tests__/a-request-the-database-must-refuse-is-not-sent.law.test.mjs`, wired through `_test-guards-exist`, plus a slug case in `tests/spin-activation-route.test.mjs`.
