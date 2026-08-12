# 2026-08-12 - Trivia mode play-test: BLOCKED (no browser automation available)

Task 2 of the 2026-08-12 handoff. Recording an honest negative result plus the
production evidence I could gather, so the next agent does not re-discover the
same wall.

## Outcome: NOT play-tested. Every automation path is unavailable.

The handoff assumed a "Chrome DevTools MCP". No such server is connected to
this session. All three available paths were tested and all three failed:

1. **Claude-in-Chrome extension** - `list_connected_browsers` returns `[]`,
   and `switch_browser` (which broadcasts a pairing request and waits) replied
   immediately that no browsers are available. The extension is not
   installed/running/signed in on this machine.
2. **Control_Chrome `execute_javascript`** - returns "Google Chrome is not
   running" even though `list_tabs` happily lists ~20 live tabs, including
   smarter.poker ones. This is the known AppleScript gate: Chrome's
   View > Developer > **Allow JavaScript from Apple Events** is off. It
   resets every time Chrome restarts, and it is off again now.
3. **computer-use** - Chrome is granted at tier "read" (screenshots only, no
   clicks or typing, by policy). The Smarter.Poker PWA was granted "full"
   earlier, but every click into it is rejected by the desktop-shell guard.
   Keyboard-only navigation reaches the auth screen and stalls there.

To unblock, ONE of these is enough:
- Install + sign in to the Claude in Chrome extension
  (https://chromewebstore.google.com/detail/fcoeoabgfenejglbffodgkkbkcdhcgfn), or
- Turn on Chrome > View > Developer > Allow JavaScript from Apple Events and
  do not restart Chrome, or
- Run `scripts/playwright-test.js` locally (the path Antigravity used for the
  arcade validation on 2026-08-06 - that worked and is the proven route).

## Production evidence gathered instead

Queried live (project `kuklfnapbkmacvwxktbh`):

**`trivia_sessions`, all time:**

| mode | status | sessions | players | diamonds paid | window |
|---|---|---|---|---|---|
| arcade | open | 12 | 1 | - | 2026-08-06 01:20 - 02:28 |
| arcade | submitted | 2 | 1 | 20 | 2026-08-06 02:05 - 02:29 |

**`trivia_scores`, last 10 days:** 2 runs, 1 player, arcade only,
last run 2026-08-06 02:30.

### What this means

- **Nine modes have zero sessions**: daily, mixed, time-attack, endless,
  survival, mtt, cash, icm, gto. PvP has zero matches.
- The cause is **no traffic, not breakage**. There have been no trivia runs
  of ANY mode in ten days beyond the arcade validation, so the absence of
  rows is explained without invoking a bug. A broken mode would more likely
  show orphaned `open` sessions or errors; there is simply nothing.
- The corollary matters more: **no organic play is going to validate this
  migration for you.** Nine modes and PvP will stay unexercised until someone
  deliberately plays them. Whatever is or is not broken will surface on the
  first real player, not before.
- The 12 open vs 2 submitted arcade sessions are abandoned runs (player quit
  mid-run). Expected, harmless - they expire after 6 hours and pay nothing.

## The test, ready to run

Log in as `daniel@bekavactrading.com`, then for each mode at
`https://smarter.poker/hub/trivia/<mode>`:

| mode | entry | mode-specific thing to watch |
|---|---|---|
| daily | free | completion bonus paid once per CST day |
| mixed | 10 | 21 questions, server draw across categories |
| time-attack | 10 | clock fires; payout is per correct answer |
| endless | 10 | ends on the THIRD miss, not the first |
| survival | 10 | each level is its own session; entry charged once |
| mtt / cash / icm / gto | 10 each | StrategyTrivia; hints are gone by design |

Pass criteria per mode: entry deducted before questions load; questions serve;
result screen figure equals what actually hit the balance; no console errors;
a `trivia_sessions` row exists with the right mode and `diamonds_awarded`.

Verification SQL:

```sql
-- sessions created by the test
SELECT mode, status, correct_count, diamonds_awarded, created_at
FROM trivia_sessions ORDER BY created_at DESC LIMIT 20;

-- CRITICAL double-pay check: exactly ONE credit per run, reference
-- trivia_session_<uuid>. A 'trivia_<mode>_game_complete_' reference means the
-- client also paid - stop and report.
SELECT amount, type, description, reference_id, created_at
FROM diamond_transactions
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'daniel@bekavactrading.com')
  AND created_at > now() - interval '2 hours'
ORDER BY created_at DESC;
```

PvP (playable solo against the house horse, whose score is server-side and
deterministic): expect the `trivia_pvp_matches` row to move
`active -> settling -> completed`, two `trivia_sessions` rows with
`mode='pvp'`, and exactly one `pvp_payout_*` or `pvp_refund_*` transaction per
human. Atomic matchmaking pairing (simultaneous join creating two match rows)
is OUT OF SCOPE - note it if observed, do not fix it here.

## Security note raised this session

A live fine-grained PAT (`ghp_HUVX...`, full value in the 2026-08-12 chat
transcript and in `.git/config`) was pasted into an agent conversation. It
should be **revoked**, not merely replaced, during the rotation described in
`PAT_EXPIRY_GUARD.md`. Note also that `scripts/git-safe-push.sh` Phase 0
blocks any commit containing a `ghp_` pattern, and GitHub auto-revokes tokens
it detects in pushed content - so a token in a tracked file will break pushes
as well as security.
