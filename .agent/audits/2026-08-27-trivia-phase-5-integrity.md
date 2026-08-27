# Trivia Phase 5 integrity audit

Date: 2026-08-27

## TL;DR

The lobby now exposes all thirteen game modes, including a new Time Attack
card, with stacked mobile/tablet cards, recoverable navigation, and an
accessible paid-entry dialog. The same pass closed three economy/security
defects: public answer keys, client-forged score rows, and browser-only paid
entry debits. Production database migrations were applied before the code
release so server routes never reference missing RPCs.

## Evidence and root causes

- `trivia_questions.correct_index` and `explanation` were selectable by
  browser roles. `get_unseen_questions` also returned the complete table row.
- `trivia_scores` permitted authenticated browser inserts, so a client could
  create a perfect score and use it as a prize-wheel token.
- Paid solo modes charged before session creation in browser code. A forged
  client could skip the debit, while a network failure could debit without a
  playable session.
- Daily reward caps used a read-then-write sequence that could be exceeded by
  concurrent tabs.
- The lobby omitted Time Attack, three hamburger shortcuts targeted dead or
  incorrect destinations, and preference names differed across the lobby and
  gameplay routes.
- The entry modal had no dialog semantics, focus containment, Escape handling,
  focus restoration, or background scroll lock.

## Resolution

### Database and economy

- `20260827190000_trivia_answer_key_lockdown.sql` grants browser roles only
  safe question columns and revokes every live `get_unseen_questions` overload.
- `20260827190500_trivia_atomic_session_entry.sql` adds entry state to sessions
  and creates the service-role-only `create_trivia_session_v2` transaction.
  A UUID start nonce makes an interrupted start safely resumable. Survival
  levels use a one-child parent chain so one fee covers one run.
- `20260827191000_trivia_verified_scores.sql` links scores to submitted
  sessions, removes browser writes, serializes daily-cap awards, records the
  score in the payout transaction, and requires that verified link before a
  wheel spin.
- The prize wheel no longer grants an item twice after the server already
  credited inventory.

### Lobby and usability

- Added Time Attack artwork and a real `/hub/trivia/time-attack` card.
- Preserved the image-over-description stack at mobile and tablet sizes.
- Added intent prefetch, awaited navigation, a visible route failure state,
  semantic filter controls, and correct shortcut routes.
- Added dialog focus trapping/restoration, Escape close, scroll lock,
  forced-colors support, and 44-pixel minimum controls.
- Unified settings keys and cleared stale account UI state on logout.

## Production migration verification

Pre-flight live state showed 11,545 question rows, 27 session rows, one score
row, and one live `get_unseen_questions` overload. The three migrations were
applied to canonical project `kuklfnapbkmacvwxktbh`. Post-apply checks proved:

- anon/authenticated cannot select `correct_index` or `explanation`;
- anon/authenticated cannot execute `get_unseen_questions`;
- anon/authenticated cannot mutate `trivia_scores`;
- `create_trivia_session_v2` and `award_trivia_run_v2` are service-role only;
- all five new columns and both new RPCs exist;
- security/performance advisor totals were unchanged from pre-flight.

## Verification

- Trivia contract suite: 15 tests.
- Next.js production build: all 274 pages compiled.
- Real-browser local checks: 390x844, 768x1024, and 1440x1000; thirteen cards,
  stacked card direction, no page overflow, Time Attack present.
- Entry dialog keyboard checks: focus moves inside, Tab remains contained,
  Escape closes, body scroll restores, and focus returns to the invoking card.

## Deferred follow-up

These were confirmed but intentionally left for the next bounded phase:

- make tournament registration/pool contribution one database transaction;
- retire or harden the legacy `/api/trivia/submit` route;
- make a lost `session-submit` response replay the original result instead of
  returning only `already_submitted`;
- enforce timed-mode deadlines in the server session, not only in the UI;
- add consumption/redemption flows for `arcade_ticket` and `streak_shield`.
