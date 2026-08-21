# Club Data comparison, the union statement board, and the cleanup

Date: 2026-08-21
Follows: `2026-08-21-messenger-audit-pass-3.md`

Five things were outstanding at the end of pass 3. Four are done and shipped;
the fifth turned out to expose a sixth, which is recorded at the bottom as open
work rather than quietly left.

---

## 1. Club Data now says "compared to what"

`Fee 46,364` is not a number anyone can act on. The same figure for the
fourteen days before it is.

The obvious way to add that would have been to copy the snapshot's 150 lines of
game-set logic and run it over a second date range. Two copies of a financial
calculation is how they drift, so instead the row set was extracted into
`fn_ca_club_games(club, start, end, game, stakes, search)` and
`ca_club_data_snapshot` now calls it twice with identical filters: the selected
window for rows and summary, the equal-length window immediately before it for
a summary only.

Before switching, the extracted function was checked against the implementation
it replaced on the same club and window: **fee 46,372.31 from both**, 889 rows.

Percentages are `NULL` when the prior window is zero. There is no baseline for
a percentage to be OF, and rendering "+100%" against nothing would be a
fabrication. The UI renders nothing in that case.

`fn_ca_club_games` is granted to **nobody** - not even `authenticated`. Only the
SECURITY DEFINER callers that run `ca_can_view_club_finances` first can reach
it. Verified: a plain club member calling it directly gets 42501.

## 2. Club Data now says which players are winning

The screen could say what the games generated. It could not answer the question
a club owner actually asks. `ca_club_player_breakdown` returns net, cash net,
tournament net, rake and hands per player over the same window, behind the same
finance check. 16 players on Club JAQK over the last fourteen days, horses
flagged as horses.

**The rake figure has a different freshness from everything else on the page,
and the page says so.** Per-player rake comes from `union_rake_paid_daily_user`,
the daily rollup, which by design only finalises complete UTC days -
`fn_union_rake_rollup_refresh_day` refuses an incomplete one. Today's rake is
therefore not in it. Recomputing live means expanding
`rake_records.player_contributions` across the window, which is the operation
measured earlier that does not finish inside the statement timeout. So the
response carries `rake_complete_through` and the footer says "per-player rake is
complete through <date>; today's rake lands in tomorrow's rollup" rather than
showing a number that is quietly a few hours short.

Sorting by "biggest losers" reads the far end of a list the RPC cut at the near
end. The footer says when the list is cut, rather than presenting a truncated
tail as the whole truth.

## 3. The union can finally see the statements it sends

This was the largest real gap. Weekly square-up statements could only be read
from the club that received one: `ca_club_union_invoices` takes a `club_id` and
gates on club finance rights. The union lead - the person who has to chase the
money - had no screen at all.

More importantly, a per-club view is structurally incapable of showing the one
failure that matters most: **the club you forgot to bill**. An absent invoice is
an absent row.

So `ca_union_statement_board` is built around the club list, not the invoice
list. Every club in the union appears for the period; a club with no statement
appears with `status = 'missing'`. Being missed is a row you can see.

Also on each row: whether the statement was actually delivered to the club
messenger, whether it is past due, and the full breakdown to the ECO line.
Amounts owed **to** the union and **by** the union are totalled separately and
never netted, because a net of zero across both is not the same as nothing being
owed.

Live against production as the union owner: 2 clubs, 228,146.79 owed, 2
delivered, 0 missing, history back to 2026-08-10. Refused with 42501 for an
ordinary club member, as are `ca_club_player_breakdown` and `fn_ca_club_games`.

The page is `/unions/:unionId/statements`, reachable from the union financials
tab. Its Issue button posts to `/api/club-arena/union-invoice` - the same route
the Monday Open Claw job calls - so it is a safety net for a Monday that did not
fire, not a second billing path. When nothing new is created the page says every
club already has a statement, rather than reporting a failure.

## 4. A brand-new thread appeared only after a page reload

The 30-second inbox poll walks the conversations it **already has** and updates
their unread counts. Its `prev.map()` can update a row; it can never add one. A
conversation that did not exist when the sidebar was built stayed invisible
until the page was reloaded.

That is exactly the shape of the weekly statement thread: the union creates it,
and a club owner sitting in the messenger would never see it arrive. It applies
equally to any first-ever message from a new sender.

The poll now compares the ids the RPC returned against the ids in the sidebar
and, when a genuinely new one appears, rebuilds through `loadConversations`.
One definition of what a sidebar row is, and a request only on the tick where
something new actually showed up.

**The global `postgres_changes` subscription is deliberately not coming back.**
It streamed every `social_messages` row to every logged-in user and was removed
for that reason. Per-conversation realtime on the ACTIVE thread already exists
and already covers `social_messages` INSERT and UPDATE, so a statement arriving
in a thread you are looking at was never the gap.

## 5. The cleanup

**`MessagingService.ts`: 1,444 lines to 105.** Every removed method read and
wrote the `conversations` / `messages` tree, which is not the messenger this
platform runs; `public.messages` has never held a row.

It was worse than dead, because it looked alive: `tests/unit/MessagingService.test.ts`
exercised `getConversations`, `getMessages`, `getReactions`, `markAsRead`,
`searchMessages` and pinning, all green, all against tables nothing writes to.
Green tests over a path no user can take are worse than no tests, so the tests
went with the code they covered.

Four methods had real callers and none touch a database: the two notification
preference accessors, `isNotificationTypeMuted`, and `generateProfileQRData`.
`setNotificationPreferences` now survives a `localStorage` write that throws -
private browsing and a full quota both do - rather than taking the settings
panel down with it. The exported `Message` / `Conversation` / `MessageReaction`
types described the dead tree and had no importer, so they left
`services/index.ts` too.

**`pages/api/messenger/broadcast-message.js` deleted.** Pass 3 listed it as
merely uncalled. Reading it properly, it should never gain a caller: it took a
`clubId`, verified the caller was an owner or admin **of that club**, and then
broadcast to **every conversation the sender participates in** - personal DMs
and other clubs' threads included. The club check gated nothing that the
broadcast then respected. It also prefixed a bare emoji onto the message body.

**The `toISODate` item from pass 3 was misdiagnosed and is closed differently.**
Pass 3 called it a UTC-vs-local bug. It is not a bug: every date on Club Data is
a UTC day, because that is how `club_table_daily` is keyed, and clamping "today"
to the UTC date is what keeps the UI consistent with the data. Switching to
local dates would have introduced a real mismatch. What was actually wrong was
that the screen showed a bare date with no timezone, so a reader late in their
evening sees a date that disagrees with their own calendar. The range chip now
says UTC. Do not "fix" this by switching to local dates.

## 6. Verification

- Club Arena: `tsc --noEmit` exit 0 on every commit; `vite build` exit 0;
  `ClubDataPage` and `UnionStatementsPage` chunks both emitted.
- World Hub: `pages/hub/messenger.js` parses under esbuild.
- Every new RPC exercised against production **under the caller's own identity**
  (`SET LOCAL role` + `request.jwt.claims`), not as the service role, so the
  authorization path was actually executed. Negative cases assert by raising:
  had any of the three refusals not happened, the probe would have failed loudly
  instead of passing quietly.
- The four migrations are applied to production AND mirrored into
  `supabase/migrations/` (versions 20260821031936, 20260821032034,
  20260821033012, 20260821033115).

## 7. The settlement lifecycle now has an end

Written up as open work an hour before it was closed, because the union board
made it impossible to leave: the screen rendered "overdue" pills and "0 paid"
with no way to resolve either, and every statement issued since 2026-08-20 still
read `status = 'generated'`. Nothing in the codebase could ever set `paid`.

`ca_union_set_statement_paid` closes it, gated on `ca_can_oversee_union`.

**It records receipt and moves no chips.** Dan, 2026-08-20: "eco doesn't move
chips, its an adjust on the end of week invoice." The same is true of the
statement as a whole - it is the bookkeeping record of what was owed for a
period, settled between people out of band. `chip_transfer_id`,
`chips_transferred` and `transferred_at` are deliberately untouched, so a
statement marked paid can never be mistaken for a chip movement that happened.
The page says this on screen, not only in a comment.

Four decisions worth keeping:

- **Partial payments are not forced into a shape that lies about them.**
  `settlement_invoices.status` is constrained to
  `(pending, generated, paid, cancelled, overdue)` - there is no `partial`. A
  part payment therefore leaves the status alone and accumulates
  `breakdown.paid_total`, and the row reads "part paid X of Y". Inventing a
  status value would have meant a schema change to express something the
  breakdown already holds.
- **Reopening is supported.** A statement that can only ever move one way turns
  a misclick into a permanent falsehood in the record. Every payment and every
  reversal is appended to `breakdown.payments` with who and when.
- **The row is locked `FOR UPDATE`** while read and written, so two union admins
  clicking at once cannot each add their payment to the same stale
  `paid_total`.
- **Overdue stays derived, never stored.** It is `due_at < now()` on an unpaid
  statement, correct by construction at read time. A stored flag needs a job to
  maintain it, and a job that does not run leaves the row lying about its own
  state.

A hundredth of a chip short counts as settled; exact equality on numeric money
would leave statements permanently one rounding step from paid.

The board gained `collected` and `outstanding`, because the headline owed figure
does not change as money comes in and on its own cannot say what is left.

Verified on production under the union owner's own JWT and rolled back: part
payment 3,000 leaves status `generated`; settling the rest flips to `paid` at
7,531.11; a repeat returns `already_settled` rather than double counting; the
board then reads paid 1, collected 7,531.11, outstanding 220,615.68, which is
exactly the other club's balance; reopening returns it to `generated` with the
history intact. An ordinary club member is refused with 42501. Production rows
confirmed unchanged after every probe.

Migration `20260821034457_union_statements_can_be_settled.sql`.

## 8. Still open

**The in-game table messenger still holds 0 messages.** Scheduling now delivers
into it; nothing has ever been sent through it.

**`union_presettlements` has never held a row.** Payments made DURING a period,
which should reduce the next statement, have no entry point. The statement
breakdown reads `presettled` and would honour it; nothing writes it. Distinct
from the settlement above, which records payment OF an issued statement.

**A club sees a raw status.** `ca_club_union_invoices` returns `status` as
stored, so a club owner reads "generated" on a statement that is past due. The
union board derives overdue; the club card does not.
