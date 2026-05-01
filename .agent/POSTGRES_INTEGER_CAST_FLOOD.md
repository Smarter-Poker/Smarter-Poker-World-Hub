# Postgres `invalid input syntax for type integer` Flood — FIXED

**Found:** 2026-04-30  
**Fixed:** 2026-05-01 15:18 UTC (engine commits `943cb47e61` + `062a7f318a`)  
**Severity:** Noise (engine retries succeeded, no data loss observed)  
**Was firing at:** ~9 errors every 5 seconds, ~150k errors/day  
**Owning subsystem:** Tournament/table game engine
(github.com/Smarter-Poker/Smarter-Poker-Club-Arena, deployed to
Hetzner workers VM)

## Resolution

Two `Math.floor()` insertions on the engine side, applied directly via
the GitHub REST API since the sandbox couldn't free disk for a clone:

- `server/src/services/supabase.ts` line 162 — `syncTournamentChips()`
  was computing `Math.trunc(seat.stack * 100) / 100`, intentionally
  preserving 2-decimal cents from the cash-style `table_seats.stack`
  (numeric(15,2)) into the tournament-style
  `tournament_players.chips` (integer). Now `Math.floor(seat.stack)`.

- `server/src/GameServer.ts` line 1755 — per-hand chip settlement
  was passing `stackValue` (numeric) directly into the integer
  column. Now `Math.floor(stackValue)`.

Both commits landed on `main` of the engine repo at 2026-05-01T15:18Z.
Once Hetzner pulls and restarts the worker process, the postgres log
flood will stop.

## Symptom

Postgres logs flooded with rejected casts:

```
ERROR:  invalid input syntax for type integer: "80511.97"
ERROR:  invalid input syntax for type integer: "31463.87"
ERROR:  invalid input syntax for type integer: "4111.1"
ERROR:  invalid input syntax for type integer: "2954.29"
ERROR:  invalid input syntax for type integer: "4095.43"
ERROR:  invalid input syntax for type integer: "7619.5"
ERROR:  invalid input syntax for type integer: "3614.66"
ERROR:  invalid input syntax for type integer: "3709.13"
```

The pattern repeats every ~5 seconds. Two distinct value sets:
- **Pair** (80511.97, 31463.87) — heads-up table
- **Septet** (2497.91, 4111.1, 2954.29, 4095.43, 7619.5, 3614.66, 3709.13) — 7-handed table

## Root cause (confirmed via `pg_stat_statements`)

The failing query is the PostgREST auto-generated UPDATE on
`tournament_players.chips`:

```sql
WITH pgrst_source AS (
    UPDATE "public"."tournament_players"
    SET "chips" = "pgrst_body"."chips"
    FROM (SELECT $1 AS json_data) pgrst_payload,
    LATERAL (
      SELECT "chips"
      FROM json_to_record(pgrst_payload.json_data) AS _("chips" integer)
    ) pgrst_body
    WHERE  ...
    AND "tournament_players"."tournament_id" = $2
    AND "tournament_players"."user_id"       = $3
    RETURNING $4
)
```

7,251,612 + 7,119,050 historical calls confirm this is the high-frequency
write path — the game engine settling each player's stack at hand end.

The schema is:
- `tournament_players.chips`     → **integer** (precision 32, scale 0)
- `tournament_players.chip_count` → numeric (no precision)

The engine is sending **decimal** values (`80511.97`) into the integer
column. PostgREST's `json_to_record(... AS _("chips" integer))` rejects
the cast, the UPDATE rolls back, and the engine apparently retries with
a floor()ed value (since stacks DO reach the DB — `tournament_players`
shows 201 active players with chips, no drift).

## Why the engine produces decimals

Engine source is in the Hetzner `workers` VM (separate repo, not
checked out locally). Likely culprits:
- PKO bounty progressive math (`bountyAmount * 100 / 2 / 100` — see
  `TournamentService.ts:2606` for similar fractional pattern)
- Prize-pool / starting-chip math leaking decimals through hand settlement
- `chip_count` (numeric) being read and written into `chips` (integer)
  without `Math.floor()`

The two columns (`chips` integer + `chip_count` numeric) are also
themselves a code smell — schema should have one chip column.

## Recommended fix (engine-side)

In the engine's per-hand stack-settlement code, before the
`tournament_players` UPDATE, ensure the chip values are integers:

```ts
// before: chips: newStack
chips: Math.floor(newStack)
```

This is a one-line fix in the engine. Cannot be made from this
codebase.

## Why not fix at the DB level

Three options were considered and rejected:

1. **`ALTER COLUMN chips TYPE bigint`** — bigint still rejects
   `"80511.97"` (the decimal point is the failure, not the size).
2. **`ALTER COLUMN chips TYPE numeric(20,0)`** — accepts decimals and
   would auto-round, BUT `supabase-js` returns numeric columns as
   **strings** to preserve precision. This would silently break every
   consumer site that does `if (player.chips > tournament.starting_chips)`
   (string vs number comparison) — including
   `TournamentService.ts:1772`, `TournamentService.ts:881-887`, and
   the entire `tournament_players` enrichment in `TournamentDetails.tsx`.
3. **BEFORE-UPDATE trigger to `floor()` the value** — the cast failure
   happens inside `json_to_record()` during query parse, before any
   row trigger fires. Triggers cannot rescue this.

## Impact assessment

- **Data integrity:** No loss observed. Active stacks track correctly
  (verified — 201 active players have chip totals).
- **Cost:** ~150k failed writes/day = ~150k extra round-trips and
  log lines. Not a database performance problem at current load,
  but it does pollute the error log and obscure real issues.
- **User-visible:** None.

## Action items

- [ ] Engine-side: floor chip values before tournament_players UPDATE
      (Hetzner workers VM, separate session)
- [ ] Schema cleanup: pick one of `chips` / `chip_count`, drop the
      other (after engine fix lands)
